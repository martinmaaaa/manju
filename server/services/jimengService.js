import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Save browser data to keep user logged in
const USER_DATA_DIR = path.resolve(__dirname, '../../playwright-user-data');

class JimengService {
    constructor() {
        this.baseUrl = 'https://jimeng.jianying.com/ai-tool/home?type=video';
    }

    /**
     * Launch a visible browser to let the user login via QR code.
     * Resolves when the user successfully logs in.
     */
    async login() {
        console.log('Starting Jimeng Login process...');
        const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
            headless: false, // Visible to user
            viewport: { width: 1280, height: 800 },
            channel: 'chrome' // Use system chrome if available, or playwright's chromium
        });

        try {
            const page = await context.newPage();
            await page.goto(this.baseUrl);

            console.log('Please scan the QR code to log into Jimeng.');

            // Wait for the user to login by waiting for a specific authenticated element
            // Or simply wait until the user says they are done, but here we wait for the URL or an element
            // For now, we wait until the user closes the browser or we detect login.
            // Detecting login: Wait for the user avatar or the main workspace to load.
            await page.waitForSelector('.user-avatar, .profile-avatar, .header-avatar', {
                timeout: 300000, // 5 minutes for user to login
                state: 'attached'
            }).catch(e => console.log('Login timeout or selector changed, assuming user is done or closed window.'));

            await context.close();
            return true;
        } catch (error) {
            console.error('Error during login:', error);
            await context.close();
            throw error;
        }
    }

    /**
     * Automate the generation of Seedance 2.0 video.
     */
    async generateVideo(prompt, filePaths) {
        let browserContext;
        try {
            console.log(`Starting Jimeng Seedance 2.0 generation with ${filePaths.length} files`);
            browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
                headless: true, // Run invisibly in background
                viewport: { width: 1280, height: 800 }
            });

            const page = await browserContext.newPage();

            // Setup response intercepting to capture the final video URL
            let generatedVideoUrl = null;
            page.on('response', async (response) => {
                const url = response.url();
                // Adjust this regex based on actual Jimeng video response URL patterns
                // E.g., looking for a specific API response that contains the generated video URL
                if (url.includes('/api/generation/result') || url.includes('video/download')) {
                    try {
                        const body = await response.json();
                        // Try to extract video url from response. This is just a placeholder logic.
                        if (body && body.data && body.data.video_url) {
                            generatedVideoUrl = body.data.video_url;
                        }
                    } catch (e) { }
                }
            });

            await page.goto(this.baseUrl, { waitUntil: 'networkidle' });

            // 1. Ensure Seedance 2.0 is selected
            // Click the model dropdown (based on the UI text)
            await page.getByText(/Seedance|视频 3.5/i).first().click();
            await page.waitForTimeout(500); // Wait for dropdown
            // Click Seedance 2.0 (not Fast)
            await page.getByText('Seedance 2.0').exact().click();

            // 2. Upload reference files if any
            if (filePaths && filePaths.length > 0) {
                // Find the generic file input on the page and upload all files
                const fileInput = await page.$('input[type="file"]');
                if (fileInput) {
                    await fileInput.setInputFiles(filePaths);
                    // Wait for uploads to complete
                    console.log('Files uploaded, waiting for processing...');
                    await page.waitForTimeout(5000); // Wait 5s for upload to process in UI
                } else {
                    console.warn('Could not find file input element to upload references.');
                }
            }

            // 3. Input Text Prompt
            // Find the textarea corresponding to the prompt
            const textarea = await page.$('textarea');
            if (textarea) {
                await textarea.fill(prompt);
            } else {
                // Fallback by finding placeholder text
                await page.getByPlaceholder(/输入文字/).fill(prompt);
            }

            // 4. Click Generate
            await page.getByRole('button', { name: /视频生成|生成|Generate/i }).click();

            // 5. Wait for Generation Result
            console.log('Video generation started. Waiting for result...');

            // Wait for a reasonable amount of time or until the video element appears in the DOM
            // For Seedance, it might take 2-5 minutes
            await page.waitForSelector('video', { timeout: 300000 }); // Wait up to 5 mins

            // Extract the video SRC from the generated video element
            const videoElement = await page.$('video');
            if (videoElement) {
                generatedVideoUrl = await videoElement.getAttribute('src');
            }

            await browserContext.close();

            if (generatedVideoUrl) {
                return { success: true, videoUrl: generatedVideoUrl };
            } else {
                return { success: false, error: 'Could not capture generated video URL from DOM or network.' };
            }

        } catch (error) {
            console.error('Automation error:', error);
            if (browserContext) {
                await browserContext.close();
            }
            return { success: false, error: error.message };
        }
    }
}

export default new JimengService();
