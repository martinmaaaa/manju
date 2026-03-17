import { randomUUID } from 'crypto';
import { getPool } from './db.js';
import { buildDefaultStageConfig } from './registries.js';

function createId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapMember(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    role: row.role,
    createdAt: toIsoString(row.created_at),
  };
}

function mapSetup(row) {
  if (!row) return null;
  return {
    projectId: row.project_id,
    aspectRatio: row.aspect_ratio,
    styleSummary: row.style_summary,
    targetMedium: row.target_medium,
    globalPrompts: asArray(row.global_prompts),
    modelPreferences: asObject(row.model_preferences),
    stageConfig: asObject(row.stage_config),
    metadata: asObject(row.metadata),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapStoryBible(row) {
  if (!row) return null;
  return {
    projectId: row.project_id,
    content: asObject(row.content),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAsset(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    name: row.name,
    description: row.description,
    isLocked: Boolean(row.is_locked),
    lockedBy: row.locked_by ?? null,
    lockedAt: row.locked_at ? toIsoString(row.locked_at) : null,
    currentVersionId: row.current_version_id ?? null,
    metadata: asObject(row.metadata),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAssetVersion(row) {
  return {
    id: row.id,
    assetId: row.asset_id,
    projectId: row.project_id,
    versionNumber: Number(row.version_number ?? 1),
    promptText: row.prompt_text,
    previewUrl: row.preview_url ?? null,
    sourcePayload: asObject(row.source_payload),
    metadata: asObject(row.metadata),
    createdBy: row.created_by ?? null,
    createdAt: toIsoString(row.created_at),
  };
}

function mapEpisode(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    episodeNumber: Number(row.episode_number ?? 0),
    title: row.title,
    synopsis: row.synopsis,
    sourceText: row.source_text,
    status: row.status,
    metadata: asObject(row.metadata),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapEpisodeContext(row) {
  if (!row) return null;
  return {
    episodeId: row.episode_id,
    projectId: row.project_id,
    contextSummary: row.context_summary,
    precedingSummary: row.preceding_summary,
    content: asObject(row.content),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapWorkspaceRow(row) {
  if (!row) return null;
  return {
    episodeId: row.episode_id,
    projectId: row.project_id,
    content: asObject(row.content),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapStudioWorkspace(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    content: asObject(row.content),
    importedAssets: asArray(row.imported_assets),
    metadata: asObject(row.metadata),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapCapabilityRun(row) {
  return {
    id: row.id,
    projectId: row.project_id ?? null,
    episodeId: row.episode_id ?? null,
    capabilityId: row.capability_id,
    modelId: row.model_id,
    skillPackId: row.skill_pack_id ?? null,
    status: row.status,
    inputPayload: asObject(row.input_payload),
    outputPayload: asObject(row.output_payload),
    error: row.error ?? null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapWorkflowRun(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    stageKind: row.stage_kind,
    status: row.status,
    capabilityRunId: row.capability_run_id ?? null,
    config: asObject(row.config),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function createUser({ email, name, passwordHash }) {
  const pool = getPool();
  const id = createId('user');
  const result = await pool.query(
    `INSERT INTO workflow_users (id, email, name, password_hash)
     VALUES ($1, LOWER($2), $3, $4)
     RETURNING *`,
    [id, email, name, passwordHash],
  );
  return mapUser(result.rows[0]);
}

export async function getUserWithPasswordByEmail(email) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM workflow_users WHERE email = LOWER($1) LIMIT 1`,
    [email],
  );
  return result.rows[0] ?? null;
}

export async function getUserById(id) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM workflow_users WHERE id = $1 LIMIT 1`,
    [id],
  );
  return mapUser(result.rows[0]);
}

export async function createSession({ userId, tokenHash, expiresAt }) {
  const pool = getPool();
  const id = createId('sess');
  await pool.query(
    `INSERT INTO workflow_sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [id, userId, tokenHash, expiresAt],
  );
  return { id, userId, expiresAt };
}

export async function getSessionByTokenHash(tokenHash) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT s.*, u.id AS account_id, u.email, u.name, u.created_at AS user_created_at, u.updated_at AS user_updated_at
     FROM workflow_sessions s
     JOIN workflow_users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.expires_at > NOW()
     LIMIT 1`,
    [tokenHash],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    session: {
      id: row.id,
      userId: row.user_id,
      expiresAt: toIsoString(row.expires_at),
      createdAt: toIsoString(row.created_at),
    },
    user: {
      id: row.account_id,
      email: row.email,
      name: row.name,
      createdAt: toIsoString(row.user_created_at),
      updatedAt: toIsoString(row.user_updated_at),
    },
  };
}

export async function deleteSessionByTokenHash(tokenHash) {
  const pool = getPool();
  await pool.query(`DELETE FROM workflow_sessions WHERE token_hash = $1`, [tokenHash]);
}

export async function createProject({ title, ownerUserId }) {
  const pool = getPool();
  const client = await pool.connect();
  const projectId = createId('proj');
  const memberId = createId('member');

  try {
    await client.query('BEGIN');
    const projectResult = await client.query(
      `INSERT INTO workflow_projects (id, title, owner_user_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [projectId, title, ownerUserId],
    );

    await client.query(
      `INSERT INTO workflow_project_members (id, project_id, user_id, role)
       VALUES ($1, $2, $3, 'owner')`,
      [memberId, projectId, ownerUserId],
    );

    await client.query(
      `INSERT INTO workflow_project_setups (project_id, stage_config)
       VALUES ($1, $2::jsonb)`,
      [projectId, JSON.stringify(buildDefaultStageConfig())],
    );

    await client.query(
      `INSERT INTO workflow_story_bibles (project_id, content)
       VALUES ($1, '{}'::jsonb)`,
      [projectId],
    );

    await client.query('COMMIT');
    return projectResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listProjectsForUser(userId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT p.*, m.role,
            (SELECT COUNT(*) FROM workflow_assets a WHERE a.project_id = p.id) AS asset_count,
            (SELECT COUNT(*) FROM workflow_episodes e WHERE e.project_id = p.id) AS episode_count,
            EXISTS(SELECT 1 FROM workflow_script_sources s WHERE s.project_id = p.id) AS has_script
     FROM workflow_projects p
     JOIN workflow_project_members m ON m.project_id = p.id
     WHERE m.user_id = $1
     ORDER BY p.updated_at DESC`,
    [userId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    ownerUserId: row.owner_user_id,
    role: row.role,
    assetCount: Number(row.asset_count ?? 0),
    episodeCount: Number(row.episode_count ?? 0),
    hasScript: Boolean(row.has_script),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  }));
}

export async function getProjectMember(projectId, userId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM workflow_project_members
     WHERE project_id = $1 AND user_id = $2
     LIMIT 1`,
    [projectId, userId],
  );
  return result.rows[0] ? mapMember(result.rows[0]) : null;
}

export async function getProjectById(projectId) {
  const pool = getPool();
  const projectResult = await pool.query(
    `SELECT * FROM workflow_projects WHERE id = $1 LIMIT 1`,
    [projectId],
  );
  const project = projectResult.rows[0];
  if (!project) return null;

  const [setup, storyBible, latestSource, members] = await Promise.all([
    getProjectSetup(projectId),
    getStoryBible(projectId),
    getLatestScriptSource(projectId),
    listProjectMembers(projectId),
  ]);

  return {
    id: project.id,
    title: project.title,
    ownerUserId: project.owner_user_id,
    setup,
    storyBible: storyBible?.content ?? null,
    latestScriptSource: latestSource,
    members,
    createdAt: toIsoString(project.created_at),
    updatedAt: toIsoString(project.updated_at),
  };
}

export async function touchProject(projectId) {
  const pool = getPool();
  await pool.query(
    `UPDATE workflow_projects SET updated_at = NOW() WHERE id = $1`,
    [projectId],
  );
}

export async function listProjectMembers(projectId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT m.*, u.email, u.name
     FROM workflow_project_members m
     JOIN workflow_users u ON u.id = m.user_id
     WHERE m.project_id = $1
     ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.created_at ASC`,
    [projectId],
  );
  return result.rows.map((row) => ({
    ...mapMember(row),
    email: row.email,
    name: row.name,
  }));
}

export async function upsertProjectMember({ projectId, userId, role }) {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO workflow_project_members (id, project_id, user_id, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id, user_id) DO UPDATE
     SET role = EXCLUDED.role
     RETURNING *`,
    [createId('member'), projectId, userId, role],
  );
  return mapMember(result.rows[0]);
}

export async function upsertScriptSource({
  projectId,
  sourceType,
  mimeType,
  originalName,
  contentText,
  metadata,
  createdBy,
}) {
  const pool = getPool();
  const id = createId('script');
  const result = await pool.query(
    `INSERT INTO workflow_script_sources
      (id, project_id, source_type, mime_type, original_name, content_text, metadata, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     RETURNING *`,
    [id, projectId, sourceType, mimeType ?? null, originalName ?? null, contentText, JSON.stringify(metadata || {}), createdBy],
  );
  await touchProject(projectId);
  return mapScriptSource(result.rows[0]);
}

export async function getLatestScriptSource(projectId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM workflow_script_sources
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [projectId],
  );
  return result.rows[0] ? mapScriptSource(result.rows[0]) : null;
}

function mapScriptSource(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceType: row.source_type,
    mimeType: row.mime_type ?? null,
    originalName: row.original_name ?? null,
    contentText: row.content_text,
    metadata: asObject(row.metadata),
    createdBy: row.created_by,
    createdAt: toIsoString(row.created_at),
  };
}

export async function getProjectSetup(projectId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM workflow_project_setups WHERE project_id = $1 LIMIT 1`,
    [projectId],
  );
  return mapSetup(result.rows[0]);
}

export async function updateProjectSetup(projectId, patch) {
  const pool = getPool();
  const current = (await getProjectSetup(projectId)) || {
    aspectRatio: '9:16',
    styleSummary: '',
    targetMedium: '漫剧',
    globalPrompts: [],
    modelPreferences: {},
    stageConfig: buildDefaultStageConfig(),
    metadata: {},
  };

  const next = {
    aspectRatio: patch.aspectRatio ?? current.aspectRatio,
    styleSummary: patch.styleSummary ?? current.styleSummary,
    targetMedium: patch.targetMedium ?? current.targetMedium,
    globalPrompts: patch.globalPrompts ?? current.globalPrompts,
    modelPreferences: patch.modelPreferences ?? current.modelPreferences,
    stageConfig: patch.stageConfig ?? current.stageConfig,
    metadata: patch.metadata ?? current.metadata,
  };

  const result = await pool.query(
    `INSERT INTO workflow_project_setups
      (project_id, aspect_ratio, style_summary, target_medium, global_prompts, model_preferences, stage_config, metadata, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, NOW())
     ON CONFLICT (project_id) DO UPDATE
     SET aspect_ratio = EXCLUDED.aspect_ratio,
         style_summary = EXCLUDED.style_summary,
         target_medium = EXCLUDED.target_medium,
         global_prompts = EXCLUDED.global_prompts,
         model_preferences = EXCLUDED.model_preferences,
         stage_config = EXCLUDED.stage_config,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()
     RETURNING *`,
    [
      projectId,
      next.aspectRatio,
      next.styleSummary,
      next.targetMedium,
      JSON.stringify(next.globalPrompts),
      JSON.stringify(next.modelPreferences),
      JSON.stringify(next.stageConfig),
      JSON.stringify(next.metadata),
    ],
  );
  await touchProject(projectId);
  return mapSetup(result.rows[0]);
}

export async function getStoryBible(projectId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM workflow_story_bibles WHERE project_id = $1 LIMIT 1`,
    [projectId],
  );
  return mapStoryBible(result.rows[0]);
}

export async function upsertStoryBible(projectId, content) {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO workflow_story_bibles (project_id, content, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (project_id) DO UPDATE
     SET content = EXCLUDED.content,
         updated_at = NOW()
     RETURNING *`,
    [projectId, JSON.stringify(content)],
  );
  await touchProject(projectId);
  return mapStoryBible(result.rows[0]);
}

export async function createOrUpdateAsset({
  projectId,
  type,
  name,
  description,
  metadata,
  promptText,
  previewUrl,
  createdBy,
}) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    let assetResult = await client.query(
      `SELECT * FROM workflow_assets WHERE project_id = $1 AND type = $2 AND name = $3 LIMIT 1`,
      [projectId, type, name],
    );
    let asset = assetResult.rows[0];

    if (!asset) {
      const assetId = createId('asset');
      assetResult = await client.query(
        `INSERT INTO workflow_assets (id, project_id, type, name, description, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING *`,
        [assetId, projectId, type, name, description || '', JSON.stringify(metadata || {})],
      );
      asset = assetResult.rows[0];
    } else {
      assetResult = await client.query(
        `UPDATE workflow_assets
         SET description = $2,
             metadata = $3::jsonb,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [asset.id, description || asset.description || '', JSON.stringify(metadata || asset.metadata || {})],
      );
      asset = assetResult.rows[0];
    }

    const versionResult = await client.query(
      `SELECT COALESCE(MAX(version_number), 0) AS max_version
       FROM workflow_asset_versions WHERE asset_id = $1`,
      [asset.id],
    );
    const versionNumber = Number(versionResult.rows[0]?.max_version ?? 0) + 1;
    const versionId = createId('assetver');
    const assetVersionResult = await client.query(
      `INSERT INTO workflow_asset_versions
        (id, asset_id, project_id, version_number, prompt_text, preview_url, source_payload, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
       RETURNING *`,
      [
        versionId,
        asset.id,
        projectId,
        versionNumber,
        promptText || '',
        previewUrl ?? null,
        JSON.stringify({ skillGenerated: false }),
        JSON.stringify(metadata || {}),
        createdBy ?? null,
      ],
    );

    await client.query(
      `UPDATE workflow_assets
       SET current_version_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [asset.id, versionId],
    );
    await client.query('COMMIT');
    await touchProject(projectId);

    return {
      asset: {
        ...mapAsset(asset),
        currentVersionId: versionId,
      },
      version: mapAssetVersion(assetVersionResult.rows[0]),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listAssetsByProjectId(projectId) {
  const pool = getPool();
  const [assetsResult, versionsResult] = await Promise.all([
    pool.query(`SELECT * FROM workflow_assets WHERE project_id = $1 ORDER BY type, name`, [projectId]),
    pool.query(`SELECT * FROM workflow_asset_versions WHERE project_id = $1 ORDER BY created_at DESC`, [projectId]),
  ]);

  const versionsByAssetId = new Map();
  for (const row of versionsResult.rows) {
    const existing = versionsByAssetId.get(row.asset_id) || [];
    existing.push(mapAssetVersion(row));
    versionsByAssetId.set(row.asset_id, existing);
  }

  return assetsResult.rows.map((row) => ({
    ...mapAsset(row),
    versions: versionsByAssetId.get(row.id) || [],
  }));
}

export async function getAssetById(assetId) {
  const pool = getPool();
  const result = await pool.query(`SELECT * FROM workflow_assets WHERE id = $1 LIMIT 1`, [assetId]);
  return result.rows[0] ? mapAsset(result.rows[0]) : null;
}

export async function setAssetLockState(assetId, { locked, userId }) {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE workflow_assets
     SET is_locked = $2,
         locked_by = CASE WHEN $2 THEN $3 ELSE NULL END,
         locked_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [assetId, locked, userId],
  );

  const asset = result.rows[0] ? mapAsset(result.rows[0]) : null;
  if (asset) {
    await touchProject(asset.projectId);
  }
  return asset;
}

export async function replaceEpisodes(projectId, episodes) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM workflow_episodes WHERE project_id = $1`, [projectId]);
    const created = [];
    for (const episode of episodes) {
      const id = createId('episode');
      const result = await client.query(
        `INSERT INTO workflow_episodes (id, project_id, episode_number, title, synopsis, source_text, status, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         RETURNING *`,
        [
          id,
          projectId,
          episode.episodeNumber,
          episode.title,
          episode.synopsis || '',
          episode.sourceText || '',
          'pending',
          JSON.stringify(episode.metadata || {}),
        ],
      );
      created.push(mapEpisode(result.rows[0]));
    }
    await client.query('COMMIT');
    await touchProject(projectId);
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listEpisodesByProjectId(projectId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM workflow_episodes WHERE project_id = $1 ORDER BY episode_number ASC`,
    [projectId],
  );
  return result.rows.map(mapEpisode);
}

export async function getEpisodeById(episodeId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM workflow_episodes WHERE id = $1 LIMIT 1`,
    [episodeId],
  );
  return result.rows[0] ? mapEpisode(result.rows[0]) : null;
}

export async function updateEpisodeStatus(episodeId, status, metadataPatch = null) {
  const pool = getPool();
  const current = await getEpisodeById(episodeId);
  if (!current) return null;

  const metadata = metadataPatch
    ? {
        ...current.metadata,
        ...metadataPatch,
      }
    : current.metadata;

  const result = await pool.query(
    `UPDATE workflow_episodes
     SET status = $2,
         metadata = $3::jsonb,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [episodeId, status, JSON.stringify(metadata)],
  );
  await touchProject(current.projectId);
  return mapEpisode(result.rows[0]);
}

export async function upsertEpisodeContext({ episodeId, projectId, contextSummary, precedingSummary, content }) {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO workflow_episode_contexts
      (episode_id, project_id, context_summary, preceding_summary, content, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (episode_id) DO UPDATE
     SET context_summary = EXCLUDED.context_summary,
         preceding_summary = EXCLUDED.preceding_summary,
         content = EXCLUDED.content,
         updated_at = NOW()
     RETURNING *`,
    [episodeId, projectId, contextSummary, precedingSummary, JSON.stringify(content || {})],
  );
  return mapEpisodeContext(result.rows[0]);
}

export async function getEpisodeContext(episodeId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM workflow_episode_contexts WHERE episode_id = $1 LIMIT 1`,
    [episodeId],
  );
  return mapEpisodeContext(result.rows[0]);
}

export async function upsertEpisodeWorkspace({ episodeId, projectId, content }) {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO workflow_episode_workspaces (episode_id, project_id, content, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (episode_id) DO UPDATE
     SET content = EXCLUDED.content,
         updated_at = NOW()
     RETURNING *`,
    [episodeId, projectId, JSON.stringify(content || {})],
  );
  return mapWorkspaceRow(result.rows[0]);
}

export async function getEpisodeWorkspace(episodeId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM workflow_episode_workspaces WHERE episode_id = $1 LIMIT 1`,
    [episodeId],
  );
  return mapWorkspaceRow(result.rows[0]);
}

export async function createStudioWorkspace({ userId, title, content, importedAssets }) {
  const pool = getPool();
  const id = createId('studio');
  const result = await pool.query(
    `INSERT INTO workflow_studio_workspaces (id, user_id, title, content, imported_assets, metadata)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, '{}'::jsonb)
     RETURNING *`,
    [id, userId, title, JSON.stringify(content || {}), JSON.stringify(importedAssets || [])],
  );
  return mapStudioWorkspace(result.rows[0]);
}

export async function getStudioWorkspace(id, userId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM workflow_studio_workspaces WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [id, userId],
  );
  return mapStudioWorkspace(result.rows[0]);
}

export async function listStudioWorkspaces(userId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM workflow_studio_workspaces
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId],
  );
  return result.rows.map(mapStudioWorkspace);
}

export async function updateStudioWorkspace(id, userId, patch) {
  const current = await getStudioWorkspace(id, userId);
  if (!current) return null;
  const pool = getPool();
  const result = await pool.query(
    `UPDATE workflow_studio_workspaces
     SET title = $3,
         content = $4::jsonb,
         imported_assets = $5::jsonb,
         metadata = $6::jsonb,
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      id,
      userId,
      patch.title ?? current.title,
      JSON.stringify(patch.content ?? current.content),
      JSON.stringify(patch.importedAssets ?? current.importedAssets),
      JSON.stringify(patch.metadata ?? current.metadata),
    ],
  );
  return mapStudioWorkspace(result.rows[0]);
}

export async function createCapabilityRun({
  projectId = null,
  episodeId = null,
  capabilityId,
  modelId,
  skillPackId = null,
  inputPayload,
}) {
  const pool = getPool();
  const id = createId('caprun');
  const result = await pool.query(
    `INSERT INTO workflow_capability_runs
      (id, project_id, episode_id, capability_id, model_id, skill_pack_id, status, input_payload, output_payload)
     VALUES ($1, $2, $3, $4, $5, $6, 'running', $7::jsonb, '{}'::jsonb)
     RETURNING *`,
    [id, projectId, episodeId, capabilityId, modelId, skillPackId, JSON.stringify(inputPayload || {})],
  );
  return mapCapabilityRun(result.rows[0]);
}

export async function finishCapabilityRun(id, { status, outputPayload = {}, error = null }) {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE workflow_capability_runs
     SET status = $2,
         output_payload = $3::jsonb,
         error = $4,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, status, JSON.stringify(outputPayload), error],
  );
  return mapCapabilityRun(result.rows[0]);
}

export async function createWorkflowRun({ projectId, stageKind, capabilityRunId = null, config = {} }) {
  const pool = getPool();
  const id = createId('wfrun');
  const result = await pool.query(
    `INSERT INTO workflow_runs (id, project_id, stage_kind, status, capability_run_id, config)
     VALUES ($1, $2, $3, 'running', $4, $5::jsonb)
     RETURNING *`,
    [id, projectId, stageKind, capabilityRunId, JSON.stringify(config)],
  );
  return mapWorkflowRun(result.rows[0]);
}

export async function finishWorkflowRun(id, { status, capabilityRunId = null, config = {} }) {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE workflow_runs
     SET status = $2,
         capability_run_id = COALESCE($3, capability_run_id),
         config = $4::jsonb,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, status, capabilityRunId, JSON.stringify(config)],
  );
  return mapWorkflowRun(result.rows[0]);
}
