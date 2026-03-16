import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_DATA_DIR = path.resolve(__dirname, '../../playwright-user-data');
const LOGIN_TIMEOUT_MS = 300000;
const GENERATION_TIMEOUT_MS = 900000;
const GENERATION_POLL_INTERVAL_MS = 5000;
const SUPPORTED_REFERENCE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);

function isSupportedImageFile(file) {
    const mimeType = String(file?.mimetype || '').toLowerCase();
    if (mimeType.startsWith('image/')) {
        return true;
    }

    const extension = path.extname(file?.originalname || file?.path || '').toLowerCase();
    return SUPPORTED_REFERENCE_EXTENSIONS.has(extension);
}

function looksLikeVideoUrl(value) {
    if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) {
        return false;
    }

    const normalized = value.toLowerCase();
    return normalized.includes('.mp4') ||
        normalized.includes('.m3u8') ||
        normalized.includes('video/mp4') ||
        normalized.includes('/video/') ||
        normalized.includes('/media/') ||
        normalized.includes('play_addr');
}

function extractVideoUrls(payload, matches = new Set()) {
    if (!payload) {
        return matches;
    }

    if (typeof payload === 'string') {
        if (looksLikeVideoUrl(payload)) {
            matches.add(payload);
        }
        return matches;
    }

    if (Array.isArray(payload)) {
        payload.forEach((item) => extractVideoUrls(item, matches));
        return matches;
    }

    if (typeof payload === 'object') {
        Object.values(payload).forEach((item) => extractVideoUrls(item, matches));
    }

    return matches;
}

function throwIfAborted(signal) {
    if (!signal?.aborted) {
        return;
    }

    const error = new Error('Jimeng job cancelled.');
    error.name = 'AbortError';
    throw error;
}

function waitWithSignal(ms, signal) {
    if (!signal) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            signal.removeEventListener('abort', abortHandler);
            resolve();
        }, ms);

        const abortHandler = () => {
            clearTimeout(timeoutId);
            signal.removeEventListener('abort', abortHandler);
            reject(new Error('Jimeng job cancelled.'));
        };

        if (signal.aborted) {
            abortHandler();
            return;
        }

        signal.addEventListener('abort', abortHandler, { once: true });
    });
}

function parseTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const normalizedValue = value.trim();
        if (!normalizedValue) {
            return 0;
        }

        const numericValue = Number(normalizedValue);
        if (Number.isFinite(numericValue)) {
            return numericValue;
        }

        const timeValue = Date.parse(normalizedValue);
        if (Number.isFinite(timeValue)) {
            return timeValue;
        }
    }

    return 0;
}

function pickFirstDefined(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== '');
}

function normalizeAssetRecord(asset, index) {
    const recordId = pickFirstDefined(
        asset?.id,
        asset?.asset_id,
        asset?.assetId,
        asset?.group_id,
        asset?.groupId,
        asset?.history_id,
        asset?.historyId,
        asset?.task_id,
        asset?.taskId,
        asset?.item_id,
        asset?.itemId,
        asset?.uuid,
        asset?.material_id,
        asset?.materialId
    );

    const prompt = pickFirstDefined(
        asset?.prompt,
        asset?.input?.prompt,
        asset?.extra?.prompt,
        asset?.description,
        asset?.title,
        asset?.text
    );

    const createdAt = parseTimestamp(
        pickFirstDefined(
            asset?.created_at,
            asset?.create_time,
            asset?.ctime,
            asset?.updated_at,
            asset?.update_time,
            asset?.mtime
        )
    );

    return {
        id: recordId ? String(recordId) : `asset-${index}-${createdAt || 'unknown'}`,
        prompt: typeof prompt === 'string' ? prompt.trim() : '',
        createdAt,
        videoUrls: Array.from(extractVideoUrls(asset)),
    };
}

function extractAssetRecords(payload) {
    const assetList = payload?.data?.asset_list;
    if (!Array.isArray(assetList)) {
        return [];
    }

    return assetList
        .map((asset, index) => normalizeAssetRecord(asset, index))
        .sort((left, right) => right.createdAt - left.createdAt);
}

function createAssetSnapshot(records = []) {
    const ids = new Set();
    const videoUrls = new Set();

    records.forEach((record) => {
        ids.add(record.id);
        record.videoUrls.forEach((videoUrl) => videoUrls.add(videoUrl));
    });

    return { ids, videoUrls };
}

function findFreshAssetVideoUrl(records, baselineSnapshot, prompt = '') {
    const promptPreview = String(prompt || '').trim();
    const matchedRecord = records.find((record) => {
        if (baselineSnapshot.ids.has(record.id)) {
            return false;
        }

        if (!promptPreview || !record.prompt) {
            return false;
        }

        return promptPreview.includes(record.prompt) ||
            record.prompt.includes(promptPreview) ||
            record.prompt.includes(promptPreview.slice(0, 12));
    });

    const freshRecords = matchedRecord
        ? [matchedRecord, ...records.filter((record) => record.id !== matchedRecord.id)]
        : records;

    for (const record of freshRecords) {
        if (baselineSnapshot.ids.has(record.id)) {
            continue;
        }

        const unseenVideoUrl = record.videoUrls.find((videoUrl) => !baselineSnapshot.videoUrls.has(videoUrl));
        if (unseenVideoUrl) {
            return unseenVideoUrl;
        }
    }

    return null;
}

class JimengService {
    constructor() {
        this.baseUrl = 'https://jimeng.jianying.com/ai-tool/home?type=video&workspace=0';
        this.historyUrl = 'https://jimeng.jianying.com/ai-tool/generate';
    }

    async launchContext({ headless, useChromeChannel = false }) {
        const options = {
            headless,
            viewport: { width: 1440, height: 960 },
        };

        if (useChromeChannel) {
            try {
                return await chromium.launchPersistentContext(USER_DATA_DIR, {
                    ...options,
                    channel: 'chrome',
                });
            } catch (error) {
                console.warn('[jimeng] Failed to launch with Chrome channel, falling back to bundled Chromium:', error.message);
            }
        }

        return chromium.launchPersistentContext(USER_DATA_DIR, options);
    }

    async getOrCreatePage(context) {
        const existingPage = context.pages().find((page) => !page.isClosed());
        if (existingPage) {
            return existingPage;
        }

        return context.newPage();
    }

    async closeBlockingModal(page) {
        const closeSelectors = [
            '[class*="close-icon-wrapper"]',
            'button[aria-label*="关闭"]',
            'button[title*="关闭"]',
        ];

        for (let attempt = 0; attempt < 3; attempt += 1) {
            let closed = false;

            for (const selector of closeSelectors) {
                const closeButton = page.locator(selector).first();
                if (await closeButton.isVisible().catch(() => false)) {
                    await closeButton.click({ timeout: 3000 }).catch(() => { });
                    await page.waitForTimeout(600);
                    closed = true;
                    break;
                }
            }

            if (!closed) {
                break;
            }
        }

        await page.keyboard.press('Escape').catch(() => { });
    }

    getPromptTextarea(page) {
        return page.locator('textarea:visible').first();
    }

    async notifyProgress(onProgress, update) {
        if (typeof onProgress !== 'function') {
            return;
        }

        await onProgress(update);
    }

    async isGenerationWorkspaceReady(page) {
        await this.closeBlockingModal(page);
        const promptTextarea = this.getPromptTextarea(page);
        return promptTextarea.isVisible().catch(() => false);
    }

    async openGenerationWorkspace(page) {
        await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => { });
        await this.closeBlockingModal(page);

        const promptTextarea = this.getPromptTextarea(page);
        await promptTextarea.waitFor({ state: 'visible', timeout: 30000 });

        const submitButton = page.locator('button[class*="submit-button"]:visible').first();
        const fileInputs = page.locator('input[type="file"]');

        return {
            promptTextarea,
            submitButton,
            fileInputs,
        };
    }

    normalizeReferenceFiles(files = []) {
        const supportedFiles = [];
        const unsupportedFiles = [];

        files.forEach((file) => {
            if (isSupportedImageFile(file)) {
                supportedFiles.push(file);
            } else {
                unsupportedFiles.push(file);
            }
        });

        if (unsupportedFiles.length > 0) {
            const names = unsupportedFiles
                .map((file) => file.originalname || path.basename(file.path || ''))
                .filter(Boolean);
            throw new Error(`Jimeng currently supports image reference files only: ${names.join(', ')}`);
        }

        if (supportedFiles.length > 2) {
            throw new Error('Jimeng currently supports at most 2 reference images per request.');
        }

        return supportedFiles;
    }

    async collectCurrentVideoUrls(page) {
        return page.evaluate(() => {
            const values = new Set();
            const nodes = document.querySelectorAll('video, video source, a[href], source[src]');

            nodes.forEach((node) => {
                const src = node.getAttribute('src') || node.getAttribute('href');
                if (src) {
                    values.add(src);
                }
            });

            return Array.from(values);
        }).catch(() => []);
    }

    async captureAssetListPayload(response) {
        try {
            const body = await response.json();
            if (Array.isArray(body?.data?.asset_list)) {
                return body;
            }
        } catch {
            // Ignore streaming or non-JSON responses
        }

        return null;
    }

    async createAssetTracker(context) {
        const page = await context.newPage();
        const state = {
            request: null,
            latestRecords: [],
        };

        const rememberAssetRequest = (request) => {
            if (!request.url().includes('/mweb/v1/get_asset_list')) {
                return;
            }

            state.request = {
                url: request.url(),
                method: request.method(),
                body: request.postData() || undefined,
            };
        };

        page.on('request', rememberAssetRequest);
        page.on('response', async (response) => {
            if (!response.url().includes('/mweb/v1/get_asset_list')) {
                return;
            }

            const payload = await this.captureAssetListPayload(response);
            if (payload) {
                state.latestRecords = extractAssetRecords(payload);
            }
        });

        await page.goto(this.historyUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => { });
        await this.closeBlockingModal(page);

        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
            if (state.request && state.latestRecords.length > 0) {
                break;
            }

            await page.waitForTimeout(1000);
        }

        const baselineRecords = await this.refreshAssetRecords(page, state);
        if (!state.request) {
            throw new Error('Unable to capture Jimeng asset list request.');
        }

        return {
            page,
            state,
            baselineSnapshot: createAssetSnapshot(baselineRecords),
        };
    }

    async refreshAssetRecords(page, state) {
        if (!state.request) {
            return state.latestRecords;
        }

        const result = await page.evaluate(async ({ url, method, body }) => {
            const response = await fetch(url, {
                method,
                body,
                headers: {
                    'content-type': 'application/json;charset=UTF-8',
                },
            });

            return {
                ok: response.ok,
                status: response.status,
                text: await response.text(),
            };
        }, state.request).catch(() => null);

        if (!result?.ok) {
            throw new Error(`Jimeng asset list polling failed with status ${result?.status ?? 'unknown'}.`);
        }

        try {
            const payload = JSON.parse(result.text);
            const records = extractAssetRecords(payload);
            state.latestRecords = records;
            return records;
        } catch {
            return state.latestRecords;
        }
    }

    async waitForEnabledSubmitButton(page, submitButton) {
        const handle = await submitButton.elementHandle();
        if (!handle) {
            throw new Error('Submit button not found on Jimeng page.');
        }

        await submitButton.waitFor({ state: 'visible', timeout: 15000 });
        await page.waitForFunction(
            (button) => {
                if (!button) {
                    return false;
                }

                const className = String(button.className || '');
                return !button.disabled && !className.includes('lv-btn-disabled');
            },
            handle,
            { timeout: 15000 }
        );
    }

    async confirmSafetyModal(page) {
        const modalTitle = page.getByText('安全确认', { exact: true }).first();
        const isVisible = await modalTitle.isVisible().catch(() => false);

        if (!isVisible) {
            return false;
        }

        for (let attempt = 0; attempt < 3; attempt += 1) {
            const confirmButton = page.getByRole('button', { name: '确认' }).last();
            await confirmButton.click({ timeout: 5000 }).catch(() => { });
            await page.waitForTimeout(800);

            const stillVisible = await modalTitle.isVisible().catch(() => false);
            if (!stillVisible) {
                return true;
            }
        }

        throw new Error('Jimeng safety confirmation dialog could not be confirmed automatically.');
    }

    async waitForGeneratedVideo(page, knownVideoUrls, getGeneratedVideoUrl, assetTracker, prompt, onProgress, signal) {
        const deadline = Date.now() + GENERATION_TIMEOUT_MS;
        let sawFreshBlobPreview = false;
        let attempt = 0;

        while (Date.now() < deadline) {
            throwIfAborted(signal);
            attempt += 1;
            if (attempt === 1 || attempt % 6 === 0) {
                await this.notifyProgress(onProgress, {
                    phase: 'WAITING_RESULT',
                    progress: 80,
                    message: 'Waiting for Jimeng to finish generating the video.',
                });
            }

            const capturedVideoUrl = getGeneratedVideoUrl();
            if (capturedVideoUrl) {
                return capturedVideoUrl;
            }

            if (assetTracker) {
                const assetRecords = await this.refreshAssetRecords(assetTracker.page, assetTracker.state);
                const assetVideoUrl = findFreshAssetVideoUrl(assetRecords, assetTracker.baselineSnapshot, prompt);
                if (assetVideoUrl) {
                    return assetVideoUrl;
                }
            }

            const domVideoUrls = await this.collectCurrentVideoUrls(page);
            for (const videoUrl of domVideoUrls) {
                if (knownVideoUrls.has(videoUrl)) {
                    continue;
                }

                if (videoUrl.startsWith('blob:')) {
                    sawFreshBlobPreview = true;
                    continue;
                }

                if (looksLikeVideoUrl(videoUrl)) {
                    return videoUrl;
                }
            }

            await waitWithSignal(GENERATION_POLL_INTERVAL_MS, signal);
        }

        if (sawFreshBlobPreview) {
            throw new Error('Jimeng showed a fresh video preview, but no reusable video URL was captured yet.');
        }

        throw new Error('Jimeng generation was submitted, but no new video URL was captured within 5 minutes.');
    }

    async login() {
        console.log('Starting Jimeng Login process...');
        const context = await this.launchContext({
            headless: false,
            useChromeChannel: true,
        });

        try {
            const page = await this.getOrCreatePage(context);
            await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });

            console.log('Please scan the QR code to log into Jimeng.');

            await page.waitForFunction(
                () => Array.from(document.querySelectorAll('textarea')).some((node) =>
                    Boolean(node && (node.offsetWidth || node.offsetHeight || node.getClientRects().length))
                ),
                { timeout: LOGIN_TIMEOUT_MS }
            ).catch(() => { });

            const ready = await this.isGenerationWorkspaceReady(page);
            await context.close();
            return ready;
        } catch (error) {
            console.error('Error during login:', error);
            await context.close();
            throw error;
        }
    }

    async generateVideo(prompt, uploadedFiles = [], options = {}) {
        let browserContext;
        let abortHandler = null;

        try {
            const trimmedPrompt = String(prompt || '').trim();
            if (!trimmedPrompt) {
                return { success: false, error: 'Prompt is required.' };
            }

            throwIfAborted(options.signal);

            await this.notifyProgress(options.onProgress, {
                phase: 'VALIDATING_INPUT',
                progress: 5,
                message: 'Validating Jimeng prompt and reference files.',
            });

            const referenceFiles = this.normalizeReferenceFiles(uploadedFiles);
            console.log(`Starting Jimeng Seedance 2.0 generation with ${referenceFiles.length} reference image(s)`);

            await this.notifyProgress(options.onProgress, {
                phase: 'OPENING_BROWSER',
                progress: 15,
                message: 'Opening Jimeng browser session.',
            });

            browserContext = await this.launchContext({ headless: true });
            if (options.signal) {
                abortHandler = () => {
                    browserContext?.close().catch(() => { });
                };
                options.signal.addEventListener('abort', abortHandler, { once: true });
            }
            const page = await this.getOrCreatePage(browserContext);
            throwIfAborted(options.signal);

            await this.notifyProgress(options.onProgress, {
                phase: 'SYNCING_HISTORY',
                progress: 25,
                message: 'Loading Jimeng history baseline.',
            });

            const assetTracker = await this.createAssetTracker(browserContext);
            throwIfAborted(options.signal);

            await this.notifyProgress(options.onProgress, {
                phase: 'OPENING_WORKSPACE',
                progress: 35,
                message: 'Opening Jimeng generation workspace.',
            });

            const { promptTextarea, submitButton, fileInputs } = await this.openGenerationWorkspace(page);
            throwIfAborted(options.signal);

            const knownVideoUrls = new Set(await this.collectCurrentVideoUrls(page));
            let generatedVideoUrl = null;
            let submissionStarted = false;

            page.on('response', async (response) => {
                const url = response.url();
                if (!submissionStarted || generatedVideoUrl) {
                    return;
                }

                if (looksLikeVideoUrl(url) && !knownVideoUrls.has(url)) {
                    generatedVideoUrl = url;
                    return;
                }

                const contentType = response.headers()['content-type'] || '';
                if (!contentType.includes('application/json') || !url.includes('/mweb/v1/')) {
                    return;
                }

                try {
                    const body = await response.json();
                    for (const candidate of extractVideoUrls(body)) {
                        if (!knownVideoUrls.has(candidate)) {
                            generatedVideoUrl = candidate;
                            break;
                        }
                    }
                } catch {
                    // Ignore streaming or non-JSON responses
                }
            });

            if (referenceFiles.length > 0) {
                await this.notifyProgress(options.onProgress, {
                    phase: 'UPLOADING_REFERENCES',
                    progress: 50,
                    message: 'Uploading reference images to Jimeng.',
                });

                const availableInputs = await fileInputs.count();
                if (availableInputs < referenceFiles.length) {
                    throw new Error('Not enough Jimeng reference upload inputs were found on the page.');
                }

                for (let index = 0; index < referenceFiles.length; index += 1) {
                    throwIfAborted(options.signal);
                    await fileInputs.nth(index).setInputFiles(referenceFiles[index].path);
                    await waitWithSignal(600, options.signal);
                }
            }

            await this.notifyProgress(options.onProgress, {
                phase: 'SUBMITTING',
                progress: 65,
                message: 'Submitting prompt to Jimeng.',
            });

            await promptTextarea.fill(trimmedPrompt);
            await this.waitForEnabledSubmitButton(page, submitButton);
            throwIfAborted(options.signal);

            console.log('Video generation started. Waiting for result...');
            submissionStarted = true;
            await submitButton.click();
            await waitWithSignal(1200, options.signal);
            await this.confirmSafetyModal(page).catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                console.warn('[jimeng] Safety confirm handling skipped:', message);
            });

            generatedVideoUrl = await this.waitForGeneratedVideo(
                page,
                knownVideoUrls,
                () => generatedVideoUrl,
                assetTracker,
                trimmedPrompt,
                options.onProgress,
                options.signal,
            );
            await browserContext.close();

            if (generatedVideoUrl) {
                await this.notifyProgress(options.onProgress, {
                    phase: 'COMPLETED',
                    progress: 95,
                    message: 'Jimeng returned a video URL.',
                });
                return { success: true, videoUrl: generatedVideoUrl };
            }

            return { success: false, error: 'Could not capture generated video URL from DOM or network.' };
        } catch (error) {
            console.error('Automation error:', error);
            if (browserContext) {
                await browserContext.close();
            }
            if (options.signal?.aborted || error?.name === 'AbortError' || error?.message === 'Jimeng job cancelled.') {
                return { success: false, error: 'Jimeng job cancelled.', cancelled: true };
            }
            return { success: false, error: error.message };
        } finally {
            if (options.signal && abortHandler) {
                options.signal.removeEventListener('abort', abortHandler);
            }
        }
    }
}

export default new JimengService();
