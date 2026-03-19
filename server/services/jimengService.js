import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { looksLikeReusableJimengVideoUrl } from '../jimengVideoUrlFilters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_DATA_DIR = path.resolve(__dirname, '../../playwright-user-data');
const LOGIN_TIMEOUT_MS = 300000;
const GENERATION_TIMEOUT_MS = 900000;
const GENERATION_POLL_INTERVAL_MS = 5000;
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const SUPPORTED_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov']);
const SUPPORTED_AUDIO_EXTENSIONS = new Set(['.mp3', '.wav']);
const JIMENG_MODE_CONFIG = {
    start_end_frames: {
        id: 'start_end_frames',
        label: '首尾帧',
        acceptedKinds: new Set(['image']),
        maxItems: 2,
    },
    all_references: {
        id: 'all_references',
        label: '全能参考',
        acceptedKinds: new Set(['image', 'video', 'audio']),
        maxItems: 12,
    },
};

function getReferenceFileExtension(file) {
    return path.extname(file?.originalname || file?.path || '').toLowerCase();
}

function detectReferenceFileKind(file) {
    const mimeType = String(file?.mimetype || '').toLowerCase();
    const extension = getReferenceFileExtension(file);

    if (mimeType.startsWith('image/') || SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
        return 'image';
    }

    if (mimeType.startsWith('video/') || SUPPORTED_VIDEO_EXTENSIONS.has(extension)) {
        return 'video';
    }

    if (mimeType.startsWith('audio/') || SUPPORTED_AUDIO_EXTENSIONS.has(extension)) {
        return 'audio';
    }

    return '';
}

function describeReferenceKind(kind) {
    if (kind === 'image') return '图片';
    if (kind === 'video') return '视频';
    if (kind === 'audio') return '音频';
    return '文件';
}

function resolveJimengMode(modeId) {
    if (modeId === 'references' || modeId === 'all_references') {
        return JIMENG_MODE_CONFIG.all_references;
    }

    if (modeId === 'start_end_frames') {
        return JIMENG_MODE_CONFIG.start_end_frames;
    }

    return JIMENG_MODE_CONFIG.start_end_frames;
}

const REFERENCE_TOKEN_PATTERN = /@(图片\d+|视频\d+|音频\d+)/g;

function looksLikeVideoUrl(value) {
    return looksLikeReusableJimengVideoUrl(value);
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

    async getActivePromptInput(page) {
        const richEditors = page.locator('[contenteditable="true"][role="textbox"]');
        const richCount = await richEditors.count();
        for (let index = 0; index < richCount; index += 1) {
            const locator = richEditors.nth(index);
            const box = await locator.boundingBox().catch(() => null);
            if (box && box.y < 420 && box.width > 240) {
                return { kind: 'rich', locator };
            }
        }

        const promptTextarea = this.getPromptTextarea(page);
        const isTextareaVisible = await promptTextarea.isVisible().catch(() => false);
        if (isTextareaVisible) {
            return { kind: 'textarea', locator: promptTextarea };
        }

        return null;
    }

    async fillPromptInput(page, prompt) {
        const promptInput = await this.getActivePromptInput(page);
        if (!promptInput) {
            throw new Error('Prompt input not found on Jimeng page.');
        }

        if (promptInput.kind === 'textarea') {
            await promptInput.locator.fill(prompt);
            return;
        }

        await promptInput.locator.click({ timeout: 5000 });
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => { });
        await page.keyboard.press('Backspace').catch(() => { });
        const supportsReferenceMentions = REFERENCE_TOKEN_PATTERN.test(prompt);
        REFERENCE_TOKEN_PATTERN.lastIndex = 0;

        if (!supportsReferenceMentions) {
            await promptInput.locator.fill(prompt).catch(async () => {
                await promptInput.locator.type(prompt, { delay: 12 });
            });
            return;
        }

        let cursor = 0;
        for (const match of prompt.matchAll(REFERENCE_TOKEN_PATTERN)) {
            const plainText = prompt.slice(cursor, match.index);
            if (plainText) {
                await promptInput.locator.type(plainText, { delay: 12 });
            }

            const referenceLabel = match[1];
            await promptInput.locator.type('@', { delay: 12 });
            await page.waitForTimeout(400);

            const suggestion = page.locator(`text=${referenceLabel}`).first();
            const suggestionVisible = await suggestion.isVisible().catch(() => false);
            if (suggestionVisible) {
                await suggestion.click({ timeout: 5000 }).catch(() => { });
            } else {
                await promptInput.locator.type(referenceLabel, { delay: 12 });
            }

            cursor = (match.index || 0) + match[0].length;
        }

        const trailingText = prompt.slice(cursor);
        if (trailingText) {
            await promptInput.locator.type(trailingText, { delay: 12 });
        }
    }

    async getActiveReferenceInput(page) {
        const fileInputs = page.locator('input[type="file"]');
        const inputCount = await fileInputs.count();
        let bestIndex = -1;
        let bestY = Number.POSITIVE_INFINITY;
        let bestX = Number.POSITIVE_INFINITY;

        for (let index = 0; index < inputCount; index += 1) {
            const locator = fileInputs.nth(index);
            const box = await locator.evaluate((element) => {
                const host = element.parentElement || element;
                const rect = host.getBoundingClientRect();
                return {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                };
            }).catch(() => null);

            if (!box || box.width <= 0 || box.height <= 0 || box.y >= 420) {
                continue;
            }

            if (box.y < bestY || box.y === bestY && box.x < bestX) {
                bestIndex = index;
                bestY = box.y;
                bestX = box.x;
            }
        }

        if (bestIndex === -1) {
            return null;
        }

        return fileInputs.nth(bestIndex);
    }

    async selectGenerationMode(page, modeId) {
        const mode = resolveJimengMode(modeId);
        const modeSelector = page.locator('div.feature-select-VcsuXi').first();
        await modeSelector.waitFor({ state: 'visible', timeout: 15000 });

        const currentLabel = String(await modeSelector.textContent().catch(() => '') || '').trim();
        if (currentLabel === mode.label) {
            return mode;
        }

        await modeSelector.click({ timeout: 5000 });
        await page.waitForTimeout(500);
        await page.locator(`text=${mode.label}`).first().click({ timeout: 5000 });
        await page.waitForTimeout(1200);
        return mode;
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

        const modeSelector = page.locator('div.feature-select-VcsuXi').first();
        await modeSelector.waitFor({ state: 'visible', timeout: 30000 });
        const submitButton = page.locator('button[class*="submit-button"]:visible').first();
        await submitButton.waitFor({ state: 'visible', timeout: 30000 });
        const fileInputs = page.locator('input[type="file"]');

        return {
            submitButton,
            fileInputs,
        };
    }

    normalizeReferenceFiles(files = [], options = {}) {
        const mode = resolveJimengMode(options.modeId);
        const supportedFiles = [];
        const unsupportedFiles = [];

        files.forEach((file) => {
            const kind = detectReferenceFileKind(file);
            if (!kind || !mode.acceptedKinds.has(kind)) {
                unsupportedFiles.push(file);
                return;
            }

            supportedFiles.push({
                ...file,
                kind,
            });
        });

        if (unsupportedFiles.length > 0) {
            const names = unsupportedFiles
                .map((file) => file.originalname || path.basename(file.path || ''))
                .filter(Boolean);
            const acceptedKinds = Array.from(mode.acceptedKinds).map((kind) => describeReferenceKind(kind)).join(' / ');
            throw new Error(`Jimeng ${mode.label} 当前只接受 ${acceptedKinds} 参考文件：${names.join(', ')}`);
        }

        if (supportedFiles.length > mode.maxItems) {
            throw new Error(`Jimeng ${mode.label} 当前最多支持 ${mode.maxItems} 个参考素材。`);
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

            const activeMode = resolveJimengMode(options.modeId);
            const referenceFiles = this.normalizeReferenceFiles(uploadedFiles, { modeId: activeMode.id });
            console.log(`Starting Jimeng Seedance 2.0 generation in ${activeMode.label} mode with ${referenceFiles.length} reference file(s)`);

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

            const { submitButton } = await this.openGenerationWorkspace(page);
            throwIfAborted(options.signal);

            await this.notifyProgress(options.onProgress, {
                phase: 'CONFIGURING_MODE',
                progress: 42,
                message: `Switching Jimeng to ${activeMode.label} mode.`,
            });

            await this.selectGenerationMode(page, activeMode.id);
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
                    message: `Uploading ${referenceFiles.length} reference file(s) to Jimeng.`,
                });

                for (const referenceFile of referenceFiles) {
                    throwIfAborted(options.signal);
                    const activeInput = await this.getActiveReferenceInput(page);
                    if (!activeInput) {
                        throw new Error('No visible Jimeng reference upload input was found for the next reference item.');
                    }

                    await activeInput.setInputFiles(referenceFile.path);
                    await waitWithSignal(1200, options.signal);
                }
            }

            await this.notifyProgress(options.onProgress, {
                phase: 'SUBMITTING',
                progress: 65,
                message: 'Submitting prompt to Jimeng.',
            });

            await this.fillPromptInput(page, trimmedPrompt);
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
