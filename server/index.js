import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import jimengService from './services/jimengService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Set up Multer for file uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = multer({ storage });

// API to trigger Jimeng Login
app.get('/api/jimeng/login', async (req, res) => {
    try {
        const success = await jimengService.login();
        res.json({ success });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API to generate Seedance 2.0 video
app.post('/api/jimeng/generate/seedance2', upload.array('files'), async (req, res) => {
    try {
        const prompt = req.body.prompt;
        const files = req.files || [];
        const filePaths = files.map(f => f.path);

        // Call Jimeng Playwright Automation
        const result = await jimengService.generateVideo(prompt, filePaths);

        // Clean up uploaded files after generation
        for (const filePath of filePaths) {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        if (result.success) {
            res.json({ success: true, videoUrl: result.videoUrl });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error('Generate error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`HahaHome Sidecar Server running at http://localhost:${port}`);
});
