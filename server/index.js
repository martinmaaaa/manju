import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import jimengService from './services/jimengService.js';
import {
    cancelJimengJob,
    enqueueJimengJob,
    ensureJimengJobWorker,
    getJimengJobStatus,
    initializeJimengJobWorker,
} from './services/jimengJobManager.js';
import { ensureDatabaseReady, getResolvedDatabaseUrl, initDatabase, markDatabaseUnavailable } from './db.js';
import {
    batchUpdateNodesById,
    cancelGenerationJobById,
    createConnectionForProject,
    createGenerationJob,
    createNodeForProject,
    createProject,
    deleteEpisodeAssetBindingById,
    createShotForWorkflowInstance,
    createShotOutputForShot,
    deleteConnectionById,
    deleteNodeById,
    deleteProjectById,
    deleteShotById,
    ensureGenerationJobBackfill,
    ensureWorkflowEntityBackfill,
    getEpisodeWorkspaceByWorkflowInstanceId,
    getGenerationJobById,
    getProjectWorkflowEntitiesById,
    listAssetsByProjectId,
    listAssetVersionsByProjectId,
    listContinuityStatesByProjectId,
    listEpisodeAssetBindingsByProjectId,
    listEpisodeAssetBindingsByWorkflowInstanceId,
    listGenerationJobs,
    listShotOutputsByShotId,
    listShotsByWorkflowInstanceId,
    listWorkflowStageRunsByWorkflowInstanceId,
    getProjectDashboardById,
    getProjectById,
    listEpisodesByProjectId,
    listProjects,
    listWorkflowInstancesByProjectId,
    requeueGenerationJobById,
    retryGenerationJobById,
    saveProjectSnapshot,
    selectShotOutputById,
    updateEpisodeAssetBindingById,
    updateNodeById,
    updateGenerationJobById,
    updateProject,
    updateShotById,
    upsertWorkflowStageRunByWorkflowInstanceId,
    upsertEpisodeAssetBindingByWorkflowInstanceId,
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
        return false;
    }

    try {
        await ensureWorkflowEntityBackfill();
        await ensureGenerationJobBackfill();
        return true;
    } catch (error) {
        sendError(res, error, 500);
        return false;
    }
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

        const project = await createProject(title, req.body?.settings || {}, req.body?.workflow_state);
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

app.get('/api/projects/:id/dashboard', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const dashboard = await getProjectDashboardById(req.params.id);
        if (!dashboard) {
            return res.status(404).json({ success: false, error: 'Project not found.' });
        }

        res.json({ success: true, data: dashboard });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.get('/api/projects/:id/workflow-instances', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const workflowInstances = await listWorkflowInstancesByProjectId(req.params.id);
        res.json({ success: true, data: workflowInstances });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.get('/api/projects/:id/episodes', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const episodes = await listEpisodesByProjectId(req.params.id);
        res.json({ success: true, data: episodes });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.get('/api/projects/:id/assets', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const assets = await listAssetsByProjectId(req.params.id);
        res.json({ success: true, data: assets });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.get('/api/projects/:id/asset-versions', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const assetVersions = await listAssetVersionsByProjectId(req.params.id);
        res.json({ success: true, data: assetVersions });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.get('/api/projects/:id/asset-bindings', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const assetBindings = await listEpisodeAssetBindingsByProjectId(req.params.id);
        res.json({ success: true, data: assetBindings });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.get('/api/projects/:id/continuity-states', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const continuityStates = await listContinuityStatesByProjectId(req.params.id);
        res.json({ success: true, data: continuityStates });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.get('/api/projects/:id/workflow-entities', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const workflowEntities = await getProjectWorkflowEntitiesById(req.params.id);
        if (!workflowEntities) {
            return res.status(404).json({ success: false, error: 'Project not found.' });
        }

        res.json({ success: true, data: workflowEntities });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.get('/api/workflows/:id/stages', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const stageRuns = await listWorkflowStageRunsByWorkflowInstanceId(req.params.id);
        res.json({ success: true, data: stageRuns });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.patch('/api/workflows/:id/stages/:stageKey', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const stageRun = await upsertWorkflowStageRunByWorkflowInstanceId(
            req.params.id,
            req.params.stageKey,
            req.body || {},
        );
        if (!stageRun) {
            return res.status(404).json({ success: false, error: 'Workflow instance not found.' });
        }

        res.json({ success: true, data: stageRun });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.get('/api/episodes/:id/workspace', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const workspace = await getEpisodeWorkspaceByWorkflowInstanceId(req.params.id);
        if (!workspace) {
            return res.status(404).json({ success: false, error: 'Episode workspace not found.' });
        }

        res.json({ success: true, data: workspace });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.get('/api/episodes/:id/bindings', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const bindings = await listEpisodeAssetBindingsByWorkflowInstanceId(req.params.id);
        res.json({ success: true, data: bindings });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.post('/api/episodes/:id/bindings', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const binding = await upsertEpisodeAssetBindingByWorkflowInstanceId(req.params.id, req.body || {});
        if (!binding) {
            return res.status(404).json({ success: false, error: 'Episode not found.' });
        }

        res.status(201).json({ success: true, data: binding });
    } catch (error) {
        sendError(res, error, 400);
    }
});

app.patch('/api/episode-bindings/:id', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const binding = await updateEpisodeAssetBindingById(req.params.id, req.body || {});
        if (!binding) {
            return res.status(404).json({ success: false, error: 'Episode binding not found.' });
        }

        res.json({ success: true, data: binding });
    } catch (error) {
        sendError(res, error, 400);
    }
});

app.delete('/api/episode-bindings/:id', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const binding = await deleteEpisodeAssetBindingById(req.params.id);
        if (!binding) {
            return res.status(404).json({ success: false, error: 'Episode binding not found.' });
        }

        res.json({ success: true, data: binding });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.get('/api/episodes/:id/shots', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const shots = await listShotsByWorkflowInstanceId(req.params.id);
        res.json({ success: true, data: shots });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.post('/api/episodes/:id/shots', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const shot = await createShotForWorkflowInstance(req.params.id, req.body || {});
        if (!shot) {
            return res.status(404).json({ success: false, error: 'Episode not found.' });
        }

        res.status(201).json({ success: true, data: shot });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.patch('/api/shots/:id', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const shot = await updateShotById(req.params.id, req.body || {});
        if (!shot) {
            return res.status(404).json({ success: false, error: 'Shot not found.' });
        }

        res.json({ success: true, data: shot });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.delete('/api/shots/:id', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const deleted = await deleteShotById(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Shot not found.' });
        }

        res.json({ success: true });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.get('/api/shots/:id/outputs', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const outputs = await listShotOutputsByShotId(req.params.id);
        res.json({ success: true, data: outputs });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.post('/api/shots/:id/outputs', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const url = String(req.body?.url || '').trim();
        if (!url) {
            return res.status(400).json({ success: false, error: 'Output url is required.' });
        }

        const output = await createShotOutputForShot(req.params.id, req.body || {});
        if (!output) {
            return res.status(404).json({ success: false, error: 'Shot not found.' });
        }

        res.status(201).json({ success: true, data: output });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.post('/api/shot-outputs/:id/select', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const output = await selectShotOutputById(req.params.id);
        if (!output) {
            return res.status(404).json({ success: false, error: 'Shot output not found.' });
        }

        res.json({ success: true, data: output });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.get('/api/projects/:id/generation-jobs', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const jobs = await listGenerationJobs({
            projectId: req.params.id,
            status: typeof req.query?.status === 'string' ? req.query.status : undefined,
            provider: typeof req.query?.provider === 'string' ? req.query.provider : undefined,
            workflowInstanceId: typeof req.query?.workflowInstanceId === 'string' ? req.query.workflowInstanceId : undefined,
            limit: typeof req.query?.limit === 'string' ? Number(req.query.limit) : undefined,
        });
        res.json({ success: true, data: jobs });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.get('/api/generation-jobs', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const jobs = await listGenerationJobs({
            status: typeof req.query?.status === 'string' ? req.query.status : undefined,
            provider: typeof req.query?.provider === 'string' ? req.query.provider : undefined,
            projectId: typeof req.query?.projectId === 'string' ? req.query.projectId : undefined,
            workflowInstanceId: typeof req.query?.workflowInstanceId === 'string' ? req.query.workflowInstanceId : undefined,
            limit: typeof req.query?.limit === 'string' ? Number(req.query.limit) : undefined,
        });
        res.json({ success: true, data: jobs });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.get('/api/generation-jobs/:id', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const job = await getGenerationJobById(req.params.id);
        if (!job) {
            return res.status(404).json({ success: false, error: 'Generation job not found.' });
        }

        res.json({ success: true, data: job });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.post('/api/generation-jobs', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const job = await createGenerationJob(req.body || {});
        res.status(201).json({ success: true, data: job });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.put('/api/generation-jobs/:id', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const job = await updateGenerationJobById(req.params.id, req.body || {});
        if (!job) {
            return res.status(404).json({ success: false, error: 'Generation job not found.' });
        }

        res.json({ success: true, data: job });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.post('/api/generation-jobs/:id/cancel', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const existingJob = await getGenerationJobById(req.params.id);
        if (!existingJob) {
            return res.status(404).json({ success: false, error: 'Generation job not found.' });
        }

        const job = existingJob.provider === 'jimeng'
            ? await cancelJimengJob(req.params.id)
            : await cancelGenerationJobById(req.params.id, req.body || {});

        if (!job) {
            return res.status(404).json({ success: false, error: 'Generation job not found.' });
        }

        res.json({ success: true, data: existingJob.provider === 'jimeng' ? await getGenerationJobById(req.params.id) : job });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.post('/api/generation-jobs/:id/requeue', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const job = await requeueGenerationJobById(req.params.id, req.body || {});
        if (!job) {
            return res.status(404).json({ success: false, error: 'Generation job not found.' });
        }

        if (job.provider === 'jimeng') {
            ensureJimengJobWorker();
        }

        res.json({ success: true, data: job });
    } catch (error) {
        markDatabaseUnavailable();
        sendError(res, error, 500);
    }
});

app.post('/api/generation-jobs/:id/retry', async (req, res) => {
    if (!(await requireDatabase(res))) return;
    try {
        const job = await retryGenerationJobById(req.params.id, req.body || {});
        if (!job) {
            return res.status(404).json({ success: false, error: 'Generation job not found.' });
        }

        if (job.provider === 'jimeng') {
            ensureJimengJobWorker();
        }

        res.json({ success: true, data: job });
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
            workflow_state: req.body?.workflow_state,
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
                capability: 'video',
                ...(typeof req.body?.projectId === 'string' && req.body.projectId.trim()
                    ? { projectId: req.body.projectId.trim() }
                    : {}),
                ...(typeof req.body?.workflowInstanceId === 'string' && req.body.workflowInstanceId.trim()
                    ? { workflowInstanceId: req.body.workflowInstanceId.trim() }
                    : {}),
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
        return ensureWorkflowEntityBackfill();
    })
    .then((result) => {
        console.log(`[db] Workflow entity backfill ready (v${result.version}, migrated ${result.migratedProjectCount} projects)`);
        return ensureGenerationJobBackfill();
    })
    .then((result) => {
        console.log(`[db] Generation job backfill ready (migrated ${result.migratedJobCount} jobs)`);
        return initializeJimengJobWorker();
    })
    .catch((error) => {
        const message = error?.message || error?.code || String(error);
        console.warn('[db] PostgreSQL init skipped:', message);
    });
