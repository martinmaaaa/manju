import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import jimengService from './services/jimengService.js';
import { enqueueJimengJob, getJimengJobStatus, initializeJimengJobWorker } from './services/jimengJobManager.js';
import { ensureDatabaseReady, getResolvedDatabaseUrl, initDatabase, markDatabaseUnavailable } from './db.js';
import {
    batchUpdateNodesById,
    createConnectionForProject,
    createNodeForProject,
    createProject,
    deleteConnectionById,
    deleteNodeById,
    deleteProjectById,
    getProjectById,
    listProjects,
    saveProjectSnapshot,
    updateNodeById,
    updateProject,
} from './persistence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = Number(process.env.PORT || 3001);

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

function sendError(res, error, status = 500) {
    console.error(error);
    res.status(status).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
    });
}

async function requireDatabase(res) {
    const ready = await ensureDatabaseReady();
    if (!ready) {
        res.status(503).json({
            success: false,
            error: 'Database is unavailable. Check DATABASE_URL and local Docker Postgres.',
        });
    }
    return ready;
}

function removeUploadedFiles(files = []) {
    for (const file of files) {
        if (file?.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
    }
}

app.get('/api/health', async (_req, res) => {
    let dbReady = false;
    try {
        dbReady = await ensureDatabaseReady();
    } catch {
        dbReady = false;
    }

    res.status(200).json({
        success: true,
        data: {
            server: true,
            database: dbReady,
            databaseHost: getResolvedDatabaseUrl().replace(/:[^:@/]+@/, ':****@'),
        },
    });
});

app.head('/api/projects', async (_req, res) => {
    const dbReady = await ensureDatabaseReady();
    res.sendStatus(dbReady ? 200 : 503);
});

app.get('/api/projects', async (_req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const projects = await listProjects();
        res.json({ success: true, data: projects });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.post('/api/projects', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const title = String(req.body?.title || '').trim();
        if (!title) {
            return res.status(400).json({ success: false, error: 'Project title is required.' });
        }

        const project = await createProject(title, req.body?.settings || {});
        res.status(201).json({ success: true, data: project });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.get('/api/projects/:id', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const project = await getProjectById(req.params.id);
        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found.' });
        }

        res.json({ success: true, data: project });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.put('/api/projects/:id', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const project = await updateProject(req.params.id, {
            title: typeof req.body?.title === 'string' ? req.body.title.trim() : undefined,
            settings: req.body?.settings,
        });

        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found.' });
        }

        res.json({ success: true, data: project });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.delete('/api/projects/:id', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        await deleteProjectById(req.params.id);
        res.json({ success: true });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.put('/api/projects/:id/snapshot', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const success = await saveProjectSnapshot(req.params.id, {
            nodes: req.body?.nodes || [],
            connections: req.body?.connections || [],
            groups: req.body?.groups || [],
        });

        if (!success) {
            return res.status(404).json({ success: false, error: 'Project not found.' });
        }

        res.json({ success: true });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.post('/api/nodes', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const node = await createNodeForProject(req.body || {});
        res.status(201).json({ success: true, data: node });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.put('/api/nodes/batch/update', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        await batchUpdateNodesById(req.body?.nodes || []);
        res.json({ success: true });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.put('/api/nodes/:id', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const node = await updateNodeById(req.params.id, req.body || {});
        if (!node) {
            return res.status(404).json({ success: false, error: 'Node not found.' });
        }

        res.json({ success: true, data: node });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.delete('/api/nodes/:id', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        await deleteNodeById(req.params.id);
        res.json({ success: true });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.post('/api/connections', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const connection = await createConnectionForProject(req.body || {});
        res.status(201).json({ success: true, data: connection });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.delete('/api/connections/:id', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        await deleteConnectionById(req.params.id);
        res.json({ success: true });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

// API to trigger Jimeng Login
app.get('/api/jimeng/login', async (req, res) => {
    try {
        const success = await jimengService.login();
        if (success) {
            res.json({ success: true });
            return;
        }

        res.status(400).json({
            success: false,
            error: '即梦登录未完成，未检测到可用的生成页面。',
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API to generate Seedance 2.0 video
async function handleJimengJobCreation(req, res) {
    if (!(await requireDatabase(res))) return;

    const files = req.files || [];
    const uploadedFiles = files.map((file) => ({
        path: file.path,
        mimetype: file.mimetype,
        originalname: file.originalname,
        size: file.size,
    }));

    try {
        const prompt = String(req.body.prompt || '').trim();
        if (!prompt) {
            removeUploadedFiles(uploadedFiles);
            return res.status(400).json({ success: false, error: 'Prompt is required.' });
        }

        const job = await enqueueJimengJob({
            prompt,
            referenceFiles: uploadedFiles,
            metadata: {
                provider: 'jimeng',
                model: 'seedance2',
            },
        });

        res.status(202).json({ success: true, data: job });
    } catch (error) {
        console.error('Generate error:', error);
        removeUploadedFiles(uploadedFiles);
        res.status(500).json({ success: false, error: error.message });
    }
}

app.post('/api/jimeng/generate/seedance2', upload.array('files'), handleJimengJobCreation);
app.post('/api/jimeng/jobs/seedance2', upload.array('files'), handleJimengJobCreation);

app.get('/api/jimeng/jobs/:id', async (req, res) => {
    if (!(await requireDatabase(res))) return;

    try {
        const job = await getJimengJobStatus(req.params.id);
        if (!job) {
            return res.status(404).json({ success: false, error: 'Jimeng job not found.' });
        }

        res.json({ success: true, data: job });
    } catch (error) {
        console.error('Jimeng job status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
console.log(`Tianti Sidecar Server running at http://localhost:${port}`);
});

initDatabase()
    .then(() => {
        console.log('[db] PostgreSQL schema is ready');
        return initializeJimengJobWorker();
    })
    .catch((error) => {
        const message = error?.message || error?.code || String(error);
        console.warn('[db] PostgreSQL init skipped:', message);
    });
