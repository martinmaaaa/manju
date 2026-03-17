import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  clearSessionCookie,
  getSessionUser,
  loginUser,
  logoutUser,
  registerUser,
  setSessionCookie,
} from './auth.js';
import { ensureDatabaseReady, getResolvedDatabaseUrl } from './db.js';
import { runCapability } from './capabilityEngine.js';
import { CAPABILITIES, MODELS, REVIEW_POLICIES, SKILL_PACKS, buildDefaultStageConfig, getCapability, getSkillPack } from './registries.js';
import { extractScriptContent, extractTitle } from './scriptExtraction.js';
import {
  createOrUpdateAsset,
  createProject,
  createStudioWorkspace,
  getAssetById,
  getEpisodeById,
  getEpisodeContext,
  getEpisodeWorkspace,
  getProjectById,
  getProjectMember,
  getProjectSetup,
  getStoryBible,
  getStudioWorkspace,
  getUserWithPasswordByEmail,
  listAssetsByProjectId,
  listCapabilityRunsByProjectId,
  listEpisodesByProjectId,
  listProjectMembers,
  listProjectsForUser,
  listStudioWorkspaces,
  listWorkflowRunsByProjectId,
  setAssetLockState,
  touchProject,
  updateEpisodeStatus,
  updateProjectSetup,
  updateStudioWorkspace,
  upsertProjectMember,
  upsertEpisodeWorkspace,
  upsertScriptSource,
} from './workflowStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors({
  origin(origin, callback) {
    callback(null, origin || true);
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

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

  return true;
}

async function authRequired(req, res, next) {
  if (!(await requireDatabase(res))) return;

  try {
    const sessionContext = await getSessionUser(req);
    if (!sessionContext?.user) {
      return res.status(401).json({
        success: false,
        error: 'Please sign in first.',
      });
    }

    req.user = sessionContext.user;
    next();
  } catch (error) {
    sendError(res, error, 500);
  }
}

async function requireProjectAccess(req, res, next) {
  if (!(await requireDatabase(res))) return;
  const projectId = req.params.id || req.params.projectId;

  try {
    const member = await getProjectMember(projectId, req.user.id);
    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Project not found or you do not have access.',
      });
    }

    req.projectMember = member;
    next();
  } catch (error) {
    sendError(res, error, 500);
  }
}

async function requireOwnerOrAdminByAsset(req, res, next) {
  if (!(await requireDatabase(res))) return;

  try {
    const asset = await getAssetById(req.params.id);
    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset not found.' });
    }

    const member = await getProjectMember(asset.projectId, req.user.id);
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ success: false, error: 'Only owner/admin can unlock assets.' });
    }

    req.asset = asset;
    req.projectMember = member;
    next();
  } catch (error) {
    sendError(res, error, 500);
  }
}

function removeUploadedFile(file) {
  if (file?.path && fs.existsSync(file.path)) {
    fs.unlinkSync(file.path);
  }
}

app.get('/api/health', async (_req, res) => {
  const dbReady = await ensureDatabaseReady();
  res.status(200).json({
    success: true,
    data: {
      server: true,
      database: dbReady,
      databaseHost: getResolvedDatabaseUrl().replace(/:[^:@/]+@/, ':****@'),
    },
  });
});

app.post('/api/auth/register', async (req, res) => {
  if (!(await requireDatabase(res))) return;

  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim();

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const user = await registerUser({ email, password, name });
    const session = await loginUser({ email, password });
    setSessionCookie(res, session.token, session.expiresAt);
    res.status(201).json({ success: true, data: session.user || user });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/auth/login', async (req, res) => {
  if (!(await requireDatabase(res))) return;

  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const session = await loginUser({ email, password });
    setSessionCookie(res, session.token, session.expiresAt);
    res.json({ success: true, data: session.user });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/auth/logout', authRequired, async (req, res) => {
  try {
    await logoutUser(req);
    clearSessionCookie(res);
    res.json({ success: true, data: { loggedOut: true } });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.get('/api/me', authRequired, async (req, res) => {
  res.json({ success: true, data: req.user });
});

app.get('/api/models', authRequired, async (_req, res) => {
  res.json({ success: true, data: MODELS });
});

app.get('/api/capabilities', authRequired, async (_req, res) => {
  res.json({ success: true, data: CAPABILITIES });
});

app.get('/api/skill-packs', authRequired, async (req, res) => {
  const stageKind = String(req.query.stageKind || '').trim();
  const items = stageKind ? SKILL_PACKS.filter((item) => item.stageKind === stageKind) : SKILL_PACKS;
  res.json({ success: true, data: items });
});

app.get('/api/review-policies', authRequired, async (_req, res) => {
  res.json({ success: true, data: REVIEW_POLICIES });
});

app.get('/api/projects', authRequired, async (req, res) => {
  try {
    const projects = await listProjectsForUser(req.user.id);
    res.json({ success: true, data: projects });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post('/api/projects', authRequired, async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    if (!title) {
      return res.status(400).json({ success: false, error: 'Project title is required.' });
    }

    const project = await createProject({ title, ownerUserId: req.user.id });
    const detail = await getProjectById(project.id);
    res.status(201).json({ success: true, data: detail });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.get('/api/projects/:id', authRequired, requireProjectAccess, async (req, res) => {
  try {
    const project = await getProjectById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found.' });
    }

    res.json({
      success: true,
      data: {
        ...project,
        currentRole: req.projectMember.role,
      },
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.get('/api/projects/:id/members', authRequired, requireProjectAccess, async (req, res) => {
  try {
    const members = await listProjectMembers(req.params.id);
    res.json({ success: true, data: members });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post('/api/projects/:id/members', authRequired, requireProjectAccess, async (req, res) => {
  try {
    if (!['owner', 'admin'].includes(req.projectMember.role)) {
      return res.status(403).json({ success: false, error: 'Only owner/admin can manage project members.' });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = String(req.body?.role || 'editor').trim();
    if (!email || !['owner', 'admin', 'editor'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email and role.' });
    }

    const userRow = await getUserWithPasswordByEmail(email);
    if (!userRow) {
      return res.status(404).json({ success: false, error: 'Target user was not found. Ask them to register first.' });
    }

    const member = await upsertProjectMember({
      projectId: req.params.id,
      userId: userRow.id,
      role,
    });

    res.status(201).json({ success: true, data: member });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/projects/:id/script-source', authRequired, requireProjectAccess, upload.single('file'), async (req, res) => {
  try {
    const textContent = String(req.body?.textContent || '').trim();
    if (!req.file && !textContent) {
      return res.status(400).json({ success: false, error: 'Please provide text content or upload a file.' });
    }

    const contentText = await extractScriptContent({
      filePath: req.file?.path,
      mimeType: req.file?.mimetype,
      originalName: req.file?.originalname,
      textContent,
    });

    if (!contentText) {
      return res.status(400).json({ success: false, error: 'No valid script text could be extracted from the input.' });
    }

    const source = await upsertScriptSource({
      projectId: req.params.id,
      sourceType: req.file ? 'upload' : 'text',
      mimeType: req.file?.mimetype || 'text/plain',
      originalName: req.file?.originalname || null,
      contentText,
      metadata: {
        extractedTitle: extractTitle(contentText),
      },
      createdBy: req.user.id,
    });

    await touchProject(req.params.id);
    res.status(201).json({ success: true, data: source });
  } catch (error) {
    sendError(res, error, 400);
  } finally {
    removeUploadedFile(req.file);
  }
});

app.get('/api/projects/:id/setup', authRequired, requireProjectAccess, async (req, res) => {
  try {
    const [setup, storyBible, latestSource] = await Promise.all([
      getProjectSetup(req.params.id),
      getStoryBible(req.params.id),
      getProjectById(req.params.id),
    ]);

    res.json({
      success: true,
      data: {
        setup,
        storyBible: storyBible?.content ?? null,
        latestScriptSource: latestSource?.latestScriptSource ?? null,
      },
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.patch('/api/projects/:id/setup', authRequired, requireProjectAccess, async (req, res) => {
  try {
    const setup = await updateProjectSetup(req.params.id, req.body || {});
    res.json({ success: true, data: setup });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.get('/api/projects/:id/stage-config', authRequired, requireProjectAccess, async (req, res) => {
  try {
    const setup = await getProjectSetup(req.params.id);
    res.json({
      success: true,
      data: setup?.stageConfig || buildDefaultStageConfig(),
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.patch('/api/projects/:id/stage-config', authRequired, requireProjectAccess, async (req, res) => {
  try {
    const current = await getProjectSetup(req.params.id);
    const stageConfig = {
      ...(current?.stageConfig || buildDefaultStageConfig()),
      ...(req.body || {}),
    };
    const setup = await updateProjectSetup(req.params.id, { stageConfig });
    res.json({ success: true, data: setup.stageConfig });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.get('/api/projects/:id/runs', authRequired, requireProjectAccess, async (req, res) => {
  try {
    const episodeId = String(req.query.episodeId || '').trim() || null;
    const [capabilityRuns, workflowRuns] = await Promise.all([
      listCapabilityRunsByProjectId(req.params.id, { episodeId, limit: 40 }),
      listWorkflowRunsByProjectId(req.params.id, { limit: 40 }),
    ]);

    res.json({
      success: true,
      data: {
        capabilityRuns,
        workflowRuns,
      },
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.get('/api/projects/:id/assets', authRequired, requireProjectAccess, async (req, res) => {
  try {
    const assets = await listAssetsByProjectId(req.params.id);
    res.json({ success: true, data: assets });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post('/api/projects/:id/assets', authRequired, requireProjectAccess, async (req, res) => {
  try {
    const type = String(req.body?.type || '').trim();
    const name = String(req.body?.name || '').trim();
    if (!type || !name) {
      return res.status(400).json({ success: false, error: 'Asset type and name are required.' });
    }

    const created = await createOrUpdateAsset({
      projectId: req.params.id,
      type,
      name,
      description: String(req.body?.description || '').trim(),
      metadata: req.body?.metadata || {},
      promptText: String(req.body?.promptText || '').trim(),
      previewUrl: req.body?.previewUrl || null,
      createdBy: req.user.id,
    });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/assets/:id/lock', authRequired, async (req, res) => {
  try {
    const asset = await getAssetById(req.params.id);
    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset not found.' });
    }

    const member = await getProjectMember(asset.projectId, req.user.id);
    if (!member) {
      return res.status(403).json({ success: false, error: 'You do not have permission to lock this asset.' });
    }

    const lockedAsset = await setAssetLockState(asset.id, { locked: true, userId: req.user.id });
    res.json({ success: true, data: lockedAsset });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/assets/:id/unlock', authRequired, requireOwnerOrAdminByAsset, async (req, res) => {
  try {
    const unlockedAsset = await setAssetLockState(req.params.id, { locked: false, userId: req.user.id });
    res.json({ success: true, data: unlockedAsset });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.get('/api/projects/:id/episodes', authRequired, requireProjectAccess, async (req, res) => {
  try {
    const episodes = await listEpisodesByProjectId(req.params.id);
    const contexts = await Promise.all(episodes.map((episode) => getEpisodeContext(episode.id)));
    res.json({
      success: true,
      data: episodes.map((episode, index) => ({
        ...episode,
        context: contexts[index],
      })),
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post('/api/projects/:projectId/episodes/:episodeId/analyze', authRequired, async (req, res) => {
  try {
    const member = await getProjectMember(req.params.projectId, req.user.id);
    if (!member) {
      return res.status(403).json({ success: false, error: 'You do not have permission to analyze this episode.' });
    }

    const project = await getProjectById(req.params.projectId);
    const skillPackId = req.body?.skillPackId
      || project?.setup?.stageConfig?.episode_expand?.skillPackId
      || 'seedance-director-v1';
    const modelId = req.body?.modelId
      || project?.setup?.stageConfig?.episode_expand?.modelId
      || 'gemini-3.1-pro-preview';

    const run = await runCapability({
      capabilityId: 'episode_expand',
      modelId,
      skillPackId,
      inputPayload: {
        projectId: req.params.projectId,
        episodeId: req.params.episodeId,
      },
      user: req.user,
    });

    const [context, workspace, updatedEpisode] = await Promise.all([
      getEpisodeContext(req.params.episodeId),
      getEpisodeWorkspace(req.params.episodeId),
      updateEpisodeStatus(req.params.episodeId, 'ready'),
    ]);

    res.json({
      success: true,
      data: {
        run,
        context,
        workspace,
        episode: updatedEpisode,
      },
    });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.get('/api/episodes/:id/context', authRequired, async (req, res) => {
  try {
    const episode = await getEpisodeById(req.params.id);
    if (!episode) {
      return res.status(404).json({ success: false, error: 'Episode not found.' });
    }
    const member = await getProjectMember(episode.projectId, req.user.id);
    if (!member) {
      return res.status(403).json({ success: false, error: 'You do not have permission to access this episode.' });
    }

    const context = await getEpisodeContext(req.params.id);
    res.json({ success: true, data: context });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.get('/api/episodes/:id/workspace', authRequired, async (req, res) => {
  try {
    const episode = await getEpisodeById(req.params.id);
    if (!episode) {
      return res.status(404).json({ success: false, error: 'Episode not found.' });
    }
    const member = await getProjectMember(episode.projectId, req.user.id);
    if (!member) {
      return res.status(403).json({ success: false, error: 'You do not have permission to access this episode.' });
    }

    const workspace = await getEpisodeWorkspace(req.params.id);
    res.json({ success: true, data: workspace });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.patch('/api/episodes/:id/workspace', authRequired, async (req, res) => {
  try {
    const episode = await getEpisodeById(req.params.id);
    if (!episode) {
      return res.status(404).json({ success: false, error: 'Episode not found.' });
    }
    const member = await getProjectMember(episode.projectId, req.user.id);
    if (!member) {
      return res.status(403).json({ success: false, error: 'You do not have permission to edit this episode.' });
    }

    const workspace = await upsertEpisodeWorkspace({
      episodeId: episode.id,
      projectId: episode.projectId,
      content: req.body?.content || {},
    });
    res.json({ success: true, data: workspace });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.get('/api/studio/workspaces', authRequired, async (req, res) => {
  try {
    let workspaces = await listStudioWorkspaces(req.user.id);
    if (workspaces.length === 0) {
      workspaces = [await createStudioWorkspace({
        userId: req.user.id,
        title: 'My Studio',
        content: {
          nodes: [],
        },
        importedAssets: [],
      })];
    }
    res.json({ success: true, data: workspaces });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post('/api/studio/workspaces', authRequired, async (req, res) => {
  try {
    const workspace = await createStudioWorkspace({
      userId: req.user.id,
      title: String(req.body?.title || 'My Studio'),
      content: req.body?.content || { nodes: [] },
      importedAssets: req.body?.importedAssets || [],
    });
    res.status(201).json({ success: true, data: workspace });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.get('/api/studio/workspaces/:id', authRequired, async (req, res) => {
  try {
    const workspace = await getStudioWorkspace(req.params.id, req.user.id);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Studio workspace not found.' });
    }
    res.json({ success: true, data: workspace });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.patch('/api/studio/workspaces/:id', authRequired, async (req, res) => {
  try {
    const workspace = await updateStudioWorkspace(req.params.id, req.user.id, req.body || {});
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Studio workspace not found.' });
    }
    res.json({ success: true, data: workspace });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/studio/workspaces/:id/import-project-assets', authRequired, async (req, res) => {
  try {
    const workspace = await getStudioWorkspace(req.params.id, req.user.id);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Studio workspace not found.' });
    }

    const projectId = String(req.body?.projectId || '').trim();
    const member = await getProjectMember(projectId, req.user.id);
    if (!member) {
      return res.status(403).json({ success: false, error: 'You do not have permission to import assets from this project.' });
    }

    const assets = await listAssetsByProjectId(projectId);
    const importedAssets = assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      projectId,
      copiedAt: new Date().toISOString(),
      sourceVersionId: asset.currentVersionId,
    }));
    const updated = await updateStudioWorkspace(req.params.id, req.user.id, {
      importedAssets: [...workspace.importedAssets, ...importedAssets],
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.post('/api/capability-runs', authRequired, async (req, res) => {
  try {
    const capabilityId = String(req.body?.capabilityId || '').trim();
    const capability = getCapability(capabilityId);
    if (!capability) {
      return res.status(400).json({ success: false, error: 'Unknown capability.' });
    }

    const projectId = req.body?.projectId || null;
    if (projectId) {
      const member = await getProjectMember(projectId, req.user.id);
      if (!member) {
        return res.status(403).json({ success: false, error: 'You do not have permission to operate on this project.' });
      }
    }

    const run = await runCapability({
      capabilityId,
      modelId: req.body?.modelId || capability.defaultModelId,
      skillPackId: req.body?.skillPackId
        || getSkillPack(req.body?.skillPackId)?.id
        || null,
      inputPayload: req.body || {},
      user: req.user,
    });
    res.status(201).json({ success: true, data: run });
  } catch (error) {
    sendError(res, error, 400);
  }
});

app.listen(port, async () => {
  const initialized = await ensureDatabaseReady();
  const host = getResolvedDatabaseUrl().replace(/:[^:@/]+@/, ':****@');
  console.log(`[workflow] online server listening on http://localhost:${port}`);
  console.log(`[workflow] database ${initialized ? 'ready' : 'unavailable'} -> ${host}`);
});
