import { randomUUID } from 'crypto';
import { getPool } from './db.js';

const WORKFLOW_ENTITY_SCHEMA_VERSION = 2;
let workflowEntityBackfillReady = false;
let workflowEntityBackfillPromise = null;
let generationJobBackfillReady = false;
let generationJobBackfillPromise = null;

function createProjectId() {
  return `proj_${randomUUID().replace(/-/g, '')}`;
}

function createJimengJobId() {
  return `jimeng_${randomUUID().replace(/-/g, '')}`;
}

function createGenerationJobId(provider = 'job') {
  const normalizedProvider = String(provider || 'job')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${normalizedProvider || 'job'}_${randomUUID().replace(/-/g, '')}`;
}

function createEntityId() {
  return randomUUID().replace(/-/g, '');
}

function createWorkflowStageRunId(workflowInstanceId, stageId) {
  return `${workflowInstanceId}:${stageId}`;
}

function createShotId() {
  return `shot_${randomUUID().replace(/-/g, '')}`;
}

function createShotOutputId() {
  return `shotout_${randomUUID().replace(/-/g, '')}`;
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

function asOptionalIsoString(value) {
  return value ? toIsoString(value) : undefined;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeGenerationJobStatus(value, fallback = 'QUEUED') {
  const normalized = String(value ?? fallback).trim().toUpperCase();
  return normalized || fallback;
}

function isGenerationJobTerminalStatus(status) {
  return ['SUCCEEDED', 'FAILED', 'CANCELLED', 'CANCELED', 'ABORTED', 'COMPLETED', 'ERROR'].includes(
    normalizeGenerationJobStatus(status),
  );
}

function isGenerationJobActiveStatus(status) {
  return ['QUEUED', 'PENDING', 'CLAIMED', 'RUNNING', 'WORKING', 'PROCESSING', 'RETRYING', 'IN_PROGRESS'].includes(
    normalizeGenerationJobStatus(status),
  );
}

function resolveWorkflowState(rowLike, settingsOverride) {
  const workflowState = asObject(rowLike?.workflow_state);
  if (Object.keys(workflowState).length > 0) {
    return workflowState;
  }

  const settings = settingsOverride ?? asObject(rowLike?.settings);
  return asObject(settings.workflowState);
}

function getWorkflowProjectState(rowLike, settingsOverride) {
  const workflowState = resolveWorkflowState(rowLike, settingsOverride);

  return {
    version: 1,
    instances: asArray(workflowState.instances).map(asObject),
    activeSeriesId: typeof workflowState.activeSeriesId === 'string' ? workflowState.activeSeriesId : null,
    activeEpisodeId: typeof workflowState.activeEpisodeId === 'string' ? workflowState.activeEpisodeId : null,
    assets: asArray(workflowState.assets).map(asObject),
    assetVersions: asArray(workflowState.assetVersions).map(asObject),
    assetBindings: asArray(workflowState.assetBindings).map(asObject),
    continuityStates: asArray(workflowState.continuityStates).map(asObject),
  };
}

function mapWorkflowInstanceRow(row) {
  return {
    id: row.id,
    templateId: row.template_id,
    scope: row.scope,
    title: row.title,
    status: row.status,
    parentInstanceId: row.parent_instance_id ?? undefined,
    currentStageId: row.current_stage_id ?? undefined,
    stageStates: asObject(row.stage_states),
    artifactIds: asArray(row.artifact_ids),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    metadata: asObject(row.metadata),
  };
}

function mapEpisodeRow(row) {
  return {
    workflowInstanceId: row.workflow_instance_id,
    projectId: row.project_id,
    seriesInstanceId: row.series_instance_id ?? null,
    episodeNumber: Number(row.episode_number ?? 0),
    title: row.title,
    status: row.status,
    currentStageId: row.current_stage_id ?? null,
    metadata: asObject(row.metadata),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAssetRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    name: row.name,
    currentVersionId: row.current_version_id ?? undefined,
    tags: asArray(row.tags),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAssetVersionRow(row) {
  return {
    id: row.id,
    assetId: row.asset_id,
    version: Number(row.version ?? 1),
    files: asArray(row.files),
    promptPack: asObject(row.prompt_pack),
    metadata: asObject(row.metadata),
    createdAt: toIsoString(row.created_at),
  };
}

function mapEpisodeAssetBindingRow(row) {
  return {
    id: row.id,
    workflowInstanceId: row.workflow_instance_id,
    assetId: row.asset_id,
    versionId: row.version_id,
    mode: row.mode,
    derivedFromVersionId: row.derived_from_version_id ?? undefined,
    createdAt: toIsoString(row.created_at),
  };
}

function mapContinuityStateRow(row) {
  return {
    id: row.id,
    workflowInstanceId: row.workflow_instance_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    state: asObject(row.state),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapWorkflowStageRunRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    workflowInstanceId: row.workflow_instance_id,
    stageId: row.stage_id,
    status: row.status,
    formData: asObject(row.form_data),
    outputs: asObject(row.outputs),
    artifactIds: asArray(row.artifact_ids),
    error: row.error ?? undefined,
    startedAt: asOptionalIsoString(row.started_at),
    completedAt: asOptionalIsoString(row.completed_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapShotRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    workflowInstanceId: row.workflow_instance_id,
    stageRunId: row.stage_run_id ?? undefined,
    shotNumber: Number(row.shot_number ?? 0),
    title: row.title,
    sourceNodeId: row.source_node_id ?? undefined,
    sourcePage: row.source_page == null ? undefined : Number(row.source_page),
    panelIndex: row.panel_index == null ? undefined : Number(row.panel_index),
    prompt: row.prompt,
    imageUrl: row.image_url ?? undefined,
    metadata: asObject(row.metadata),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapShotOutputRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    workflowInstanceId: row.workflow_instance_id ?? undefined,
    shotId: row.shot_id,
    generationJobId: row.generation_job_id ?? undefined,
    provider: row.provider ?? undefined,
    outputType: row.output_type,
    label: row.label ?? undefined,
    url: row.url,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    metadata: asObject(row.metadata),
    isSelected: Boolean(row.is_selected),
    selectedAt: asOptionalIsoString(row.selected_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function getHydratedWorkflowProjectState(rowLike, persistedCollectionsInput, settingsOverride) {
  const fallbackState = getWorkflowProjectState(rowLike, settingsOverride);
  const persistedCollections = Array.isArray(persistedCollectionsInput)
    ? { instances: persistedCollectionsInput }
    : asObject(persistedCollectionsInput);
  const instances = Array.isArray(persistedCollections.instances) && persistedCollections.instances.length > 0
    ? persistedCollections.instances
    : fallbackState.instances;
  const assets = Array.isArray(persistedCollections.assets) && persistedCollections.assets.length > 0
    ? persistedCollections.assets
    : fallbackState.assets;
  const assetVersions = Array.isArray(persistedCollections.assetVersions) && persistedCollections.assetVersions.length > 0
    ? persistedCollections.assetVersions
    : fallbackState.assetVersions;
  const assetBindings = Array.isArray(persistedCollections.assetBindings) && persistedCollections.assetBindings.length > 0
    ? persistedCollections.assetBindings
    : fallbackState.assetBindings;
  const continuityStates = Array.isArray(persistedCollections.continuityStates) && persistedCollections.continuityStates.length > 0
    ? persistedCollections.continuityStates
    : fallbackState.continuityStates;

  const persistedIds = new Set(instances.map((instance) => instance.id));

  return {
    ...fallbackState,
    instances,
    assets,
    assetVersions,
    assetBindings,
    continuityStates,
    activeSeriesId: typeof fallbackState.activeSeriesId === 'string' && persistedIds.has(fallbackState.activeSeriesId)
      ? fallbackState.activeSeriesId
      : null,
    activeEpisodeId: typeof fallbackState.activeEpisodeId === 'string' && persistedIds.has(fallbackState.activeEpisodeId)
      ? fallbackState.activeEpisodeId
      : null,
  };
}

function buildEpisodesFromWorkflowState(projectId, workflowState) {
  return asArray(workflowState?.instances)
    .filter((instance) => instance.scope === 'episode')
    .map((instance) => ({
      workflowInstanceId: instance.id,
      projectId,
      seriesInstanceId: instance.parentInstanceId ?? null,
      episodeNumber: Number(instance.metadata?.episodeNumber ?? 0),
      title: instance.title,
      status: instance.status,
      currentStageId: instance.currentStageId ?? null,
      metadata: asObject(instance.metadata),
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt,
    }));
}

function countCompletedInstanceStages(instance) {
  return Object.values(asObject(instance.stageStates)).filter(
    (stage) => asObject(stage).status === 'completed',
  ).length;
}

function getEpisodeInstances(workflowState, seriesInstanceId) {
  return workflowState.instances
    .filter((instance) => instance.parentInstanceId === seriesInstanceId)
    .sort((left, right) => Number(left.metadata?.episodeNumber ?? 0) - Number(right.metadata?.episodeNumber ?? 0));
}

function getSeriesAssetCoverageSummary(workflowState, seriesInstanceId, plannedEpisodeCount) {
  const episodes = getEpisodeInstances(workflowState, seriesInstanceId);
  const episodeIds = new Set(episodes.map((episode) => episode.id));
  const denominator = plannedEpisodeCount > 0 ? plannedEpisodeCount : episodes.length;
  const relevantBindings = workflowState.assetBindings.filter(
    (binding) => episodeIds.has(binding.workflowInstanceId),
  );

  let coveredAssetCount = 0;
  let uncoveredAssetCount = 0;

  for (const asset of workflowState.assets) {
    const boundCount = relevantBindings.filter((binding) => binding.assetId === asset.id).length;

    if (boundCount > 0) {
      coveredAssetCount += 1;
    }

    if (Math.max(denominator - boundCount, 0) > 0) {
      uncoveredAssetCount += 1;
    }
  }

  return {
    coveredAssetCount,
    uncoveredAssetCount,
  };
}

function buildSeriesDashboardSummary(workflowState, seriesInstance) {
  const episodes = getEpisodeInstances(workflowState, seriesInstance.id);
  const plannedEpisodeCount = Number(seriesInstance.metadata?.plannedEpisodeCount ?? episodes.length);
  const coverageSummary = getSeriesAssetCoverageSummary(workflowState, seriesInstance.id, plannedEpisodeCount);

  return {
    id: seriesInstance.id,
    title: seriesInstance.title,
    updatedAt: typeof seriesInstance.updatedAt === 'string' ? seriesInstance.updatedAt : new Date().toISOString(),
    plannedEpisodeCount,
    createdEpisodeCount: episodes.length,
    seriesStageCount: Object.keys(asObject(seriesInstance.stageStates)).length,
    seriesCompletedStageCount: countCompletedInstanceStages(seriesInstance),
    coveredAssetCount: coverageSummary.coveredAssetCount,
    uncoveredAssetCount: coverageSummary.uncoveredAssetCount,
    scriptCompletedEpisodeCount: episodes.filter(
      (episode) => asObject(episode.stageStates)['episode-script']?.status === 'completed',
    ).length,
    assetCompletedEpisodeCount: episodes.filter(
      (episode) => asObject(episode.stageStates)['episode-assets']?.status === 'completed',
    ).length,
    storyboardCompletedEpisodeCount: episodes.filter(
      (episode) => asObject(episode.stageStates).storyboard?.status === 'completed',
    ).length,
    promptCompletedEpisodeCount: episodes.filter(
      (episode) => asObject(episode.stageStates).prompt?.status === 'completed',
    ).length,
    videoCompletedEpisodeCount: episodes.filter(
      (episode) => asObject(episode.stageStates).video?.status === 'completed',
    ).length,
  };
}

function resolveProjectDashboardPhase(workflowState, totals, rootWorkflows) {
  if (totals.workflowCount === 0) {
    return 'empty';
  }

  if (totals.seriesCount === 0) {
    const allStandaloneCompleted = rootWorkflows.every(
      (workflow) => countCompletedInstanceStages(workflow) >= Object.keys(asObject(workflow.stageStates)).length,
    );
    return allStandaloneCompleted ? 'ready_for_canvas' : 'in_production';
  }

  if (workflowState.assets.length === 0) {
    return 'asset_setup';
  }

  if (totals.episodeCount === 0 || totals.plannedEpisodeCount > totals.episodeCount) {
    return 'episode_planning';
  }

  if (totals.videoCompletedEpisodeCount < totals.episodeCount) {
    return 'in_production';
  }

  return 'ready_for_canvas';
}

function buildProjectDashboardSummary(project) {
  const workflowState = project.workflowState;
  const rootWorkflows = workflowState.instances.filter((instance) => !instance.parentInstanceId);
  const seriesInstances = rootWorkflows
    .filter((instance) => instance.scope === 'series')
    .sort((left, right) => new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime());
  const series = seriesInstances.map((instance) => buildSeriesDashboardSummary(workflowState, instance));
  const activeSeries = seriesInstances.find((instance) => instance.id === workflowState.activeSeriesId) ?? seriesInstances[0] ?? null;
  const activeWorkflow = activeSeries ?? rootWorkflows[0] ?? null;
  const activeEpisode = workflowState.activeEpisodeId
    ? workflowState.instances.find((instance) => instance.id === workflowState.activeEpisodeId) ?? null
    : (activeSeries ? getEpisodeInstances(workflowState, activeSeries.id)[0] ?? null : null);
  const totals = series.reduce((accumulator, seriesSummary) => ({
    ...accumulator,
    plannedEpisodeCount: accumulator.plannedEpisodeCount + seriesSummary.plannedEpisodeCount,
    episodeCount: accumulator.episodeCount + seriesSummary.createdEpisodeCount,
    scriptCompletedEpisodeCount: accumulator.scriptCompletedEpisodeCount + seriesSummary.scriptCompletedEpisodeCount,
    assetCompletedEpisodeCount: accumulator.assetCompletedEpisodeCount + seriesSummary.assetCompletedEpisodeCount,
    storyboardCompletedEpisodeCount: accumulator.storyboardCompletedEpisodeCount + seriesSummary.storyboardCompletedEpisodeCount,
    promptCompletedEpisodeCount: accumulator.promptCompletedEpisodeCount + seriesSummary.promptCompletedEpisodeCount,
    videoCompletedEpisodeCount: accumulator.videoCompletedEpisodeCount + seriesSummary.videoCompletedEpisodeCount,
  }), {
    workflowCount: rootWorkflows.length,
    seriesCount: series.length,
    episodeCount: 0,
    plannedEpisodeCount: 0,
    assetCount: workflowState.assets.length,
    assetVersionCount: workflowState.assetVersions.length,
    bindingCount: workflowState.assetBindings.length,
    continuityCount: workflowState.continuityStates.length,
    scriptCompletedEpisodeCount: 0,
    assetCompletedEpisodeCount: 0,
    storyboardCompletedEpisodeCount: 0,
    promptCompletedEpisodeCount: 0,
    videoCompletedEpisodeCount: 0,
  });

  return {
    projectId: project.id,
    projectTitle: project.title,
    activeWorkflowId: activeWorkflow?.id ?? null,
    activeWorkflowTitle: activeWorkflow?.title ?? null,
    activeSeriesId: activeSeries?.id ?? null,
    activeSeriesTitle: activeSeries?.title ?? null,
    activeEpisodeId: activeEpisode?.id ?? null,
    activeEpisodeTitle: activeEpisode?.title ?? null,
    phase: resolveProjectDashboardPhase(workflowState, totals, rootWorkflows),
    totals,
    series,
  };
}

function appendUniqueValue(values, value) {
  return values.includes(value) ? values : [...values, value];
}

function removeValue(values, value) {
  return values.filter((item) => item !== value);
}

function mapProjectSummary(row, overrides = {}) {
  const settings = asObject(overrides.settings ?? row.settings);
  const workflowState = overrides.workflowState ?? getWorkflowProjectState(row, settings);

  return {
    id: row.id,
    title: row.title,
    settings,
    workflow_state: workflowState,
    dashboard: buildProjectDashboardSummary({
      id: row.id,
      title: row.title,
      workflowState,
    }),
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  };
}

function mapNode(row) {
  return {
    id: row.id,
    type: row.type,
    x: Number(row.x ?? 0),
    y: Number(row.y ?? 0),
    width: row.width == null ? undefined : Number(row.width),
    height: row.height == null ? undefined : Number(row.height),
    title: row.title,
    status: row.status,
    data: asObject(row.data),
    inputs: asArray(row.inputs),
  };
}

function mapConnection(row) {
  return {
    id: row.id,
    from: row.from_node,
    to: row.to_node,
  };
}

function mapJimengReferenceFile(file, includePath = false) {
  const mapped = {
    originalname: typeof file?.originalname === 'string' ? file.originalname : '',
    mimetype: typeof file?.mimetype === 'string' ? file.mimetype : '',
    size: Number(file?.size ?? 0),
  };

  if (includePath && typeof file?.path === 'string') {
    return {
      ...mapped,
      path: file.path,
    };
  }

  return mapped;
}

function mapJimengJob(row, { includeReferencePaths = false } = {}) {
  return {
    id: row.id,
    prompt: row.prompt,
    status: row.status,
    phase: row.phase,
    progress: Number(row.progress ?? 0),
    error: row.error ?? undefined,
    videoUrl: row.result_video_url ?? undefined,
    referenceFiles: asArray(row.reference_files).map((file) =>
      mapJimengReferenceFile(file, includeReferencePaths),
    ),
    metadata: asObject(row.metadata),
    attempts: Number(row.attempts ?? 0),
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
    started_at: asOptionalIsoString(row.started_at),
    completed_at: asOptionalIsoString(row.completed_at),
  };
}

function mapGenerationJobRow(row, { includeReferencePaths = false } = {}) {
  return {
    id: row.id,
    legacyJobId: row.legacy_job_id ?? undefined,
    projectId: row.project_id ?? undefined,
    workflowInstanceId: row.workflow_instance_id ?? undefined,
    provider: row.provider,
    model: row.model ?? undefined,
    capability: row.capability,
    prompt: row.prompt,
    status: row.status,
    phase: row.phase,
    progress: Number(row.progress ?? 0),
    error: row.error ?? undefined,
    resultUrl: row.result_url ?? undefined,
    referenceFiles: asArray(row.reference_files).map((file) =>
      mapJimengReferenceFile(file, includeReferencePaths),
    ),
    sourcePayload: asObject(row.source_payload),
    resultPayload: asObject(row.result_payload),
    metadata: asObject(row.metadata),
    attempts: Number(row.attempts ?? 0),
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
    started_at: asOptionalIsoString(row.started_at),
    completed_at: asOptionalIsoString(row.completed_at),
  };
}

function mapGenerationJobInputFromJimengRow(row) {
  const metadata = asObject(row.metadata);
  const referenceFiles = asArray(row.reference_files).map((file) => ({
    path: file?.path,
    mimetype: file?.mimetype,
    originalname: file?.originalname,
    size: Number(file?.size ?? 0),
  }));

  return {
    id: row.id,
    legacyJobId: row.id,
    projectId: typeof metadata.projectId === 'string' ? metadata.projectId : null,
    workflowInstanceId: typeof metadata.workflowInstanceId === 'string' ? metadata.workflowInstanceId : null,
    provider: typeof metadata.provider === 'string' ? metadata.provider : 'jimeng',
    model: typeof metadata.model === 'string' ? metadata.model : null,
    capability: typeof metadata.capability === 'string' ? metadata.capability : 'video',
    prompt: row.prompt,
    status: row.status,
    phase: row.phase,
    progress: Number(row.progress ?? 0),
    error: row.error ?? null,
    resultUrl: row.result_video_url ?? null,
    referenceFiles,
    sourcePayload: {
      legacyTable: 'jimeng_jobs',
      referenceFileCount: referenceFiles.length,
    },
    resultPayload: row.result_video_url ? { videoUrl: row.result_video_url } : {},
    metadata,
    attempts: Number(row.attempts ?? 0),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    startedAt: row.started_at ? toIsoString(row.started_at) : null,
    completedAt: row.completed_at ? toIsoString(row.completed_at) : null,
  };
}

async function withTransaction(callback) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureWorkflowEntityBackfill() {
  if (workflowEntityBackfillReady) {
    return {
      version: WORKFLOW_ENTITY_SCHEMA_VERSION,
      migratedProjectCount: 0,
    };
  }

  if (workflowEntityBackfillPromise) {
    return workflowEntityBackfillPromise;
  }

  workflowEntityBackfillPromise = (async () => {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id
       FROM projects
       WHERE workflow_entities_version < $1
       ORDER BY updated_at ASC, id ASC`,
      [WORKFLOW_ENTITY_SCHEMA_VERSION],
    );

    let migratedProjectCount = 0;

    for (const row of result.rows) {
      const migrated = await withTransaction(async (client) => {
        const project = await getProjectRow(client, row.id);
        if (!project) {
          return false;
        }

        const currentVersion = Number(project.workflow_entities_version ?? 0);
        if (currentVersion >= WORKFLOW_ENTITY_SCHEMA_VERSION) {
          return false;
        }

        const workflowState = getWorkflowProjectState(project, asObject(project.settings));
        await syncProjectWorkflowEntities(client, row.id, workflowState);
        await client.query(
          `UPDATE projects
           SET workflow_entities_version = $2
           WHERE id = $1`,
          [row.id, WORKFLOW_ENTITY_SCHEMA_VERSION],
        );
        return true;
      });

      if (migrated) {
        migratedProjectCount += 1;
      }
    }

    workflowEntityBackfillReady = true;
    return {
      version: WORKFLOW_ENTITY_SCHEMA_VERSION,
      migratedProjectCount,
    };
  })()
    .catch((error) => {
      workflowEntityBackfillReady = false;
      throw error;
    })
    .finally(() => {
      workflowEntityBackfillPromise = null;
    });

  return workflowEntityBackfillPromise;
}

export async function ensureGenerationJobBackfill() {
  if (generationJobBackfillReady) {
    return {
      migratedJobCount: 0,
    };
  }

  if (generationJobBackfillPromise) {
    return generationJobBackfillPromise;
  }

  generationJobBackfillPromise = (async () => {
    const pool = getPool();
    const result = await pool.query(
      `SELECT j.id, j.prompt, j.status, j.phase, j.progress, j.error, j.result_video_url, j.reference_files,
              j.metadata, j.attempts, j.created_at, j.updated_at, j.started_at, j.completed_at
       FROM jimeng_jobs j
       LEFT JOIN generation_jobs g
         ON g.id = j.id
       WHERE g.id IS NULL
       ORDER BY j.created_at ASC, j.id ASC`,
    );

    let migratedJobCount = 0;

    if ((result.rowCount ?? 0) > 0) {
      await withTransaction(async (client) => {
        for (const row of result.rows) {
          await syncGenerationJobFromJimengRow(client, row);
          migratedJobCount += 1;
        }
      });
    }

    generationJobBackfillReady = true;
    return {
      migratedJobCount,
    };
  })()
    .catch((error) => {
      generationJobBackfillReady = false;
      throw error;
    })
    .finally(() => {
      generationJobBackfillPromise = null;
    });

  return generationJobBackfillPromise;
}

async function listWorkflowInstancesForProjectIds(client, projectIds) {
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    return new Map();
  }

  const result = await client.query(
    `SELECT id, project_id, template_id, scope, title, status, parent_instance_id, current_stage_id,
            stage_states, artifact_ids, metadata, created_at, updated_at
     FROM workflow_instances
     WHERE project_id = ANY($1::text[])
     ORDER BY created_at ASC, id ASC`,
    [projectIds],
  );

  return result.rows.reduce((accumulator, row) => {
    const instances = accumulator.get(row.project_id) ?? [];
    instances.push(mapWorkflowInstanceRow(row));
    accumulator.set(row.project_id, instances);
    return accumulator;
  }, new Map());
}

async function listEpisodesForProjectIds(client, projectIds) {
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    return new Map();
  }

  const result = await client.query(
    `SELECT workflow_instance_id, project_id, series_instance_id, episode_number, title, status,
            current_stage_id, metadata, created_at, updated_at
     FROM episodes
     WHERE project_id = ANY($1::text[])
     ORDER BY episode_number ASC, created_at ASC, workflow_instance_id ASC`,
    [projectIds],
  );

  return result.rows.reduce((accumulator, row) => {
    const episodes = accumulator.get(row.project_id) ?? [];
    episodes.push(mapEpisodeRow(row));
    accumulator.set(row.project_id, episodes);
    return accumulator;
  }, new Map());
}

async function listAssetsForProjectIds(client, projectIds) {
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    return new Map();
  }

  const result = await client.query(
    `SELECT id, project_id, type, name, current_version_id, tags, created_at, updated_at
     FROM assets
     WHERE project_id = ANY($1::text[])
     ORDER BY created_at ASC, id ASC`,
    [projectIds],
  );

  return result.rows.reduce((accumulator, row) => {
    const assets = accumulator.get(row.project_id) ?? [];
    assets.push(mapAssetRow(row));
    accumulator.set(row.project_id, assets);
    return accumulator;
  }, new Map());
}

async function listAssetVersionsForProjectIds(client, projectIds) {
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    return new Map();
  }

  const result = await client.query(
    `SELECT id, project_id, asset_id, version, files, prompt_pack, metadata, created_at
     FROM asset_versions
     WHERE project_id = ANY($1::text[])
     ORDER BY created_at ASC, id ASC`,
    [projectIds],
  );

  return result.rows.reduce((accumulator, row) => {
    const assetVersions = accumulator.get(row.project_id) ?? [];
    assetVersions.push(mapAssetVersionRow(row));
    accumulator.set(row.project_id, assetVersions);
    return accumulator;
  }, new Map());
}

async function listEpisodeAssetBindingsForProjectIds(client, projectIds) {
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    return new Map();
  }

  const result = await client.query(
    `SELECT id, project_id, workflow_instance_id, asset_id, version_id, mode, derived_from_version_id, created_at
     FROM episode_asset_bindings
     WHERE project_id = ANY($1::text[])
     ORDER BY created_at ASC, id ASC`,
    [projectIds],
  );

  return result.rows.reduce((accumulator, row) => {
    const assetBindings = accumulator.get(row.project_id) ?? [];
    assetBindings.push(mapEpisodeAssetBindingRow(row));
    accumulator.set(row.project_id, assetBindings);
    return accumulator;
  }, new Map());
}

async function listContinuityStatesForProjectIds(client, projectIds) {
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    return new Map();
  }

  const result = await client.query(
    `SELECT id, project_id, workflow_instance_id, subject_type, subject_id, state, updated_at
     FROM continuity_states
     WHERE project_id = ANY($1::text[])
     ORDER BY updated_at ASC, id ASC`,
    [projectIds],
  );

  return result.rows.reduce((accumulator, row) => {
    const continuityStates = accumulator.get(row.project_id) ?? [];
    continuityStates.push(mapContinuityStateRow(row));
    accumulator.set(row.project_id, continuityStates);
    return accumulator;
  }, new Map());
}

async function listWorkflowStageRunsForProjectIds(client, projectIds) {
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    return new Map();
  }

  const result = await client.query(
    `SELECT id, project_id, workflow_instance_id, stage_id, status, form_data, outputs, artifact_ids, error,
            started_at, completed_at, created_at, updated_at
     FROM workflow_stage_runs
     WHERE project_id = ANY($1::text[])
     ORDER BY workflow_instance_id ASC, created_at ASC, stage_id ASC`,
    [projectIds],
  );

  return result.rows.reduce((accumulator, row) => {
    const stageRuns = accumulator.get(row.project_id) ?? [];
    stageRuns.push(mapWorkflowStageRunRow(row));
    accumulator.set(row.project_id, stageRuns);
    return accumulator;
  }, new Map());
}

async function listShotsForProjectIds(client, projectIds) {
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    return new Map();
  }

  const result = await client.query(
    `SELECT id, project_id, workflow_instance_id, stage_run_id, shot_number, title, source_node_id, source_page,
            panel_index, prompt, image_url, metadata, created_at, updated_at
     FROM shots
     WHERE project_id = ANY($1::text[])
     ORDER BY workflow_instance_id ASC, shot_number ASC, created_at ASC, id ASC`,
    [projectIds],
  );

  return result.rows.reduce((accumulator, row) => {
    const shots = accumulator.get(row.project_id) ?? [];
    shots.push(mapShotRow(row));
    accumulator.set(row.project_id, shots);
    return accumulator;
  }, new Map());
}

async function listShotOutputsForProjectIds(client, projectIds) {
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    return new Map();
  }

  const result = await client.query(
    `SELECT id, project_id, workflow_instance_id, shot_id, generation_job_id, provider, output_type, label, url,
            thumbnail_url, metadata, is_selected, selected_at, created_at, updated_at
     FROM shot_outputs
     WHERE project_id = ANY($1::text[])
     ORDER BY shot_id ASC, created_at DESC, id ASC`,
    [projectIds],
  );

  return result.rows.reduce((accumulator, row) => {
    const shotOutputs = accumulator.get(row.project_id) ?? [];
    shotOutputs.push(mapShotOutputRow(row));
    accumulator.set(row.project_id, shotOutputs);
    return accumulator;
  }, new Map());
}

async function loadPersistedWorkflowCollectionsByProjectIds(client, projectIds) {
  const [
    workflowInstancesByProjectId,
    episodesByProjectId,
    assetsByProjectId,
    assetVersionsByProjectId,
    assetBindingsByProjectId,
    continuityStatesByProjectId,
  ] = await Promise.all([
    listWorkflowInstancesForProjectIds(client, projectIds),
    listEpisodesForProjectIds(client, projectIds),
    listAssetsForProjectIds(client, projectIds),
    listAssetVersionsForProjectIds(client, projectIds),
    listEpisodeAssetBindingsForProjectIds(client, projectIds),
    listContinuityStatesForProjectIds(client, projectIds),
  ]);

  return {
    workflowInstancesByProjectId,
    episodesByProjectId,
    assetsByProjectId,
    assetVersionsByProjectId,
    assetBindingsByProjectId,
    continuityStatesByProjectId,
  };
}

function buildWorkflowStageRunsFromInstances(projectId, instances) {
  return asArray(instances).flatMap((instance) => (
    Object.values(asObject(instance.stageStates)).map((stageState) => ({
      id: createWorkflowStageRunId(instance.id, stageState.stageId),
      projectId,
      workflowInstanceId: instance.id,
      stageId: stageState.stageId,
      status: String(stageState.status ?? 'not_started'),
      formData: asObject(stageState.formData),
      outputs: asObject(stageState.outputs),
      artifactIds: asArray(stageState.artifactIds),
      error: stageState.error ?? null,
      startedAt: stageState.startedAt ? toIsoString(stageState.startedAt) : null,
      completedAt: stageState.completedAt ? toIsoString(stageState.completedAt) : null,
      createdAt: instance.createdAt ? toIsoString(instance.createdAt) : new Date().toISOString(),
      updatedAt: instance.updatedAt ? toIsoString(instance.updatedAt) : new Date().toISOString(),
    }))
  ));
}

function getPersistedWorkflowCollectionsForProject(loadedCollections, projectId) {
  return {
    instances: loadedCollections.workflowInstancesByProjectId.get(projectId),
    assets: loadedCollections.assetsByProjectId.get(projectId),
    assetVersions: loadedCollections.assetVersionsByProjectId.get(projectId),
    assetBindings: loadedCollections.assetBindingsByProjectId.get(projectId),
    continuityStates: loadedCollections.continuityStatesByProjectId.get(projectId),
  };
}

function sortWorkflowInstancesForPersistence(instances) {
  const byId = new Map(instances.map((instance) => [instance.id, instance]));
  const visited = new Set();
  const ordered = [];

  function visit(instance) {
    if (!instance || visited.has(instance.id)) {
      return;
    }

    if (instance.parentInstanceId) {
      visit(byId.get(instance.parentInstanceId));
    }

    visited.add(instance.id);
    ordered.push(instance);
  }

  instances.forEach(visit);
  return ordered;
}

async function syncProjectWorkflowEntities(client, projectId, workflowStateInput) {
  const workflowState = getWorkflowProjectState({ workflow_state: workflowStateInput });
  const orderedInstances = sortWorkflowInstancesForPersistence(workflowState.instances.map(asObject));
  const workflowStageRuns = buildWorkflowStageRunsFromInstances(projectId, orderedInstances);
  const assets = workflowState.assets.map(asObject);
  const assetVersions = workflowState.assetVersions.map(asObject);
  const assetBindings = workflowState.assetBindings.map(asObject);
  const continuityStates = workflowState.continuityStates.map(asObject);
  const workflowInstanceIds = new Set(orderedInstances.map((instance) => instance.id));
  const assetIds = new Set(assets.map((asset) => asset.id));
  const validAssetVersions = assetVersions.filter((version) => assetIds.has(version.assetId));
  const assetVersionIds = new Set(validAssetVersions.map((version) => version.id));
  const validAssetBindings = assetBindings.filter((binding) => (
    workflowInstanceIds.has(binding.workflowInstanceId)
    && assetIds.has(binding.assetId)
    && assetVersionIds.has(binding.versionId)
  ));
  const validContinuityStates = continuityStates.filter((continuityState) => (
    workflowInstanceIds.has(continuityState.workflowInstanceId)
  ));

  if (workflowInstanceIds.size > 0) {
    await client.query(
      `DELETE FROM shots
       WHERE project_id = $1
         AND NOT (workflow_instance_id = ANY($2::text[]))`,
      [projectId, Array.from(workflowInstanceIds)],
    );
  } else {
    await client.query('DELETE FROM shots WHERE project_id = $1', [projectId]);
  }

  await client.query('DELETE FROM continuity_states WHERE project_id = $1', [projectId]);
  await client.query('DELETE FROM episode_asset_bindings WHERE project_id = $1', [projectId]);
  await client.query('DELETE FROM episodes WHERE project_id = $1', [projectId]);
  await client.query('DELETE FROM asset_versions WHERE project_id = $1', [projectId]);
  await client.query('DELETE FROM assets WHERE project_id = $1', [projectId]);
  await client.query('DELETE FROM workflow_instances WHERE project_id = $1', [projectId]);

  for (const instance of orderedInstances) {
    await client.query(
      `INSERT INTO workflow_instances (
        id, project_id, template_id, scope, title, status, parent_instance_id, current_stage_id,
        stage_states, artifact_ids, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13
      )`,
      [
        instance.id ?? createEntityId(),
        projectId,
        String(instance.templateId ?? ''),
        String(instance.scope ?? 'standalone'),
        String(instance.title ?? ''),
        String(instance.status ?? 'idle'),
        instance.parentInstanceId ?? null,
        instance.currentStageId ?? null,
        JSON.stringify(asObject(instance.stageStates)),
        JSON.stringify(asArray(instance.artifactIds)),
        JSON.stringify(asObject(instance.metadata)),
        instance.createdAt ? toIsoString(instance.createdAt) : new Date().toISOString(),
        instance.updatedAt ? toIsoString(instance.updatedAt) : new Date().toISOString(),
      ],
    );
  }

  for (const stageRun of workflowStageRuns) {
    await client.query(
      `INSERT INTO workflow_stage_runs (
        id, project_id, workflow_instance_id, stage_id, status, form_data, outputs, artifact_ids, error,
        started_at, completed_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13
      )`,
      [
        stageRun.id,
        projectId,
        stageRun.workflowInstanceId,
        stageRun.stageId,
        stageRun.status,
        JSON.stringify(asObject(stageRun.formData)),
        JSON.stringify(asObject(stageRun.outputs)),
        JSON.stringify(asArray(stageRun.artifactIds)),
        stageRun.error ?? null,
        stageRun.startedAt ? toIsoString(stageRun.startedAt) : null,
        stageRun.completedAt ? toIsoString(stageRun.completedAt) : null,
        stageRun.createdAt ? toIsoString(stageRun.createdAt) : new Date().toISOString(),
        stageRun.updatedAt ? toIsoString(stageRun.updatedAt) : new Date().toISOString(),
      ],
    );
  }

  for (const asset of assets) {
    await client.query(
      `INSERT INTO assets (
        id, project_id, type, name, current_version_id, tags, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7, $8
      )`,
      [
        asset.id ?? createEntityId(),
        projectId,
        String(asset.type ?? 'character'),
        String(asset.name ?? ''),
        asset.currentVersionId ?? null,
        JSON.stringify(asArray(asset.tags)),
        asset.createdAt ? toIsoString(asset.createdAt) : new Date().toISOString(),
        asset.updatedAt ? toIsoString(asset.updatedAt) : new Date().toISOString(),
      ],
    );
  }

  for (const assetVersion of validAssetVersions) {
    await client.query(
      `INSERT INTO asset_versions (
        id, project_id, asset_id, version, files, prompt_pack, metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8
      )`,
      [
        assetVersion.id ?? createEntityId(),
        projectId,
        assetVersion.assetId,
        Number(assetVersion.version ?? 1),
        JSON.stringify(asArray(assetVersion.files)),
        JSON.stringify(asObject(assetVersion.promptPack)),
        JSON.stringify(asObject(assetVersion.metadata)),
        assetVersion.createdAt ? toIsoString(assetVersion.createdAt) : new Date().toISOString(),
      ],
    );
  }

  for (const assetBinding of validAssetBindings) {
    await client.query(
      `INSERT INTO episode_asset_bindings (
        id, project_id, workflow_instance_id, asset_id, version_id, mode, derived_from_version_id, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8
      )`,
      [
        assetBinding.id ?? createEntityId(),
        projectId,
        assetBinding.workflowInstanceId,
        assetBinding.assetId,
        assetBinding.versionId,
        String(assetBinding.mode ?? 'follow_latest'),
        assetBinding.derivedFromVersionId && assetVersionIds.has(assetBinding.derivedFromVersionId)
          ? assetBinding.derivedFromVersionId
          : null,
        assetBinding.createdAt ? toIsoString(assetBinding.createdAt) : new Date().toISOString(),
      ],
    );
  }

  for (const continuityState of validContinuityStates) {
    await client.query(
      `INSERT INTO continuity_states (
        id, project_id, workflow_instance_id, subject_type, subject_id, state, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7
      )`,
      [
        continuityState.id ?? createEntityId(),
        projectId,
        continuityState.workflowInstanceId,
        String(continuityState.subjectType ?? 'character'),
        String(continuityState.subjectId ?? ''),
        JSON.stringify(asObject(continuityState.state)),
        continuityState.updatedAt ? toIsoString(continuityState.updatedAt) : new Date().toISOString(),
      ],
    );
  }

  for (const instance of orderedInstances) {
    if (instance.scope !== 'episode') {
      continue;
    }

    await client.query(
      `INSERT INTO episodes (
        workflow_instance_id, project_id, series_instance_id, episode_number, title, status,
        current_stage_id, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10
      )`,
      [
        instance.id,
        projectId,
        instance.parentInstanceId ?? null,
        Number(instance.metadata?.episodeNumber ?? 0),
        String(instance.title ?? ''),
        String(instance.status ?? 'idle'),
        instance.currentStageId ?? null,
        JSON.stringify(asObject(instance.metadata)),
        instance.createdAt ? toIsoString(instance.createdAt) : new Date().toISOString(),
        instance.updatedAt ? toIsoString(instance.updatedAt) : new Date().toISOString(),
      ],
    );
  }
}

async function getProjectRow(client, id) {
  const result = await client.query(
    `SELECT id, title, settings, workflow_state, workflow_entities_version, groups, created_at, updated_at
     FROM projects
     WHERE id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

async function getHydratedWorkflowStateByProjectId(client, projectId) {
  const project = await getProjectRow(client, projectId);
  if (!project) {
    return null;
  }

  const settings = asObject(project.settings);
  const loadedCollections = await loadPersistedWorkflowCollectionsByProjectIds(client, [projectId]);

  return getHydratedWorkflowProjectState(
    project,
    getPersistedWorkflowCollectionsForProject(loadedCollections, projectId),
    settings,
  );
}

async function getWorkflowInstanceRow(client, id) {
  const result = await client.query(
    `SELECT id, project_id, template_id, scope, title, status, parent_instance_id, current_stage_id,
            stage_states, artifact_ids, metadata, created_at, updated_at
     FROM workflow_instances
     WHERE id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

async function getNodeRow(client, id) {
  const result = await client.query(
    `SELECT id, project_id, type, title, x, y, width, height, status, data, inputs, created_at, updated_at
     FROM nodes
     WHERE id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

async function getWorkflowStageRunRow(client, workflowInstanceId, stageId) {
  const result = await client.query(
    `SELECT id, project_id, workflow_instance_id, stage_id, status, form_data, outputs, artifact_ids, error,
            started_at, completed_at, created_at, updated_at
     FROM workflow_stage_runs
     WHERE workflow_instance_id = $1
       AND stage_id = $2`,
    [workflowInstanceId, stageId],
  );

  return result.rows[0] ?? null;
}

async function getShotRow(client, id) {
  const result = await client.query(
    `SELECT id, project_id, workflow_instance_id, stage_run_id, shot_number, title, source_node_id, source_page,
            panel_index, prompt, image_url, metadata, created_at, updated_at
     FROM shots
     WHERE id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

async function getShotOutputRow(client, id) {
  const result = await client.query(
    `SELECT id, project_id, workflow_instance_id, shot_id, generation_job_id, provider, output_type, label, url,
            thumbnail_url, metadata, is_selected, selected_at, created_at, updated_at
     FROM shot_outputs
     WHERE id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

async function syncWorkflowInstanceStageState(client, workflowInstanceId, stageRunPayload) {
  const workflowInstance = await getWorkflowInstanceRow(client, workflowInstanceId);
  if (!workflowInstance) {
    return null;
  }

  const nextStageStates = {
    ...asObject(workflowInstance.stage_states),
    [stageRunPayload.stageId]: {
      stageId: stageRunPayload.stageId,
      status: stageRunPayload.status,
      formData: asObject(stageRunPayload.formData),
      outputs: asObject(stageRunPayload.outputs),
      artifactIds: asArray(stageRunPayload.artifactIds),
      error: stageRunPayload.error ?? undefined,
      startedAt: stageRunPayload.startedAt ?? undefined,
      completedAt: stageRunPayload.completedAt ?? undefined,
    },
  };

  await client.query(
    `UPDATE workflow_instances
     SET stage_states = $2::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [workflowInstanceId, JSON.stringify(nextStageStates)],
  );

  return workflowInstance.project_id;
}

async function getJimengJobRow(client, id) {
  const result = await client.query(
    `SELECT id, prompt, status, phase, progress, error, result_video_url, reference_files, metadata, attempts,
            created_at, updated_at, started_at, completed_at
     FROM jimeng_jobs
     WHERE id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

async function getGenerationJobRow(client, id) {
  const result = await client.query(
    `SELECT id, legacy_job_id, project_id, workflow_instance_id, provider, model, capability, prompt,
            status, phase, progress, error, result_url, reference_files, source_payload, result_payload,
            metadata, attempts, created_at, updated_at, started_at, completed_at
     FROM generation_jobs
     WHERE id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

async function upsertGenerationJob(client, payload) {
  const result = await client.query(
    `INSERT INTO generation_jobs (
      id, legacy_job_id, project_id, workflow_instance_id, provider, model, capability, prompt, status, phase,
      progress, error, result_url, reference_files, source_payload, result_payload, metadata, attempts,
      created_at, updated_at, started_at, completed_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18,
      $19, $20, $21, $22
    )
    ON CONFLICT (id) DO UPDATE SET
      legacy_job_id = EXCLUDED.legacy_job_id,
      project_id = EXCLUDED.project_id,
      workflow_instance_id = EXCLUDED.workflow_instance_id,
      provider = EXCLUDED.provider,
      model = EXCLUDED.model,
      capability = EXCLUDED.capability,
      prompt = EXCLUDED.prompt,
      status = EXCLUDED.status,
      phase = EXCLUDED.phase,
      progress = EXCLUDED.progress,
      error = EXCLUDED.error,
      result_url = EXCLUDED.result_url,
      reference_files = EXCLUDED.reference_files,
      source_payload = EXCLUDED.source_payload,
      result_payload = EXCLUDED.result_payload,
      metadata = EXCLUDED.metadata,
      attempts = EXCLUDED.attempts,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      started_at = EXCLUDED.started_at,
      completed_at = EXCLUDED.completed_at
    RETURNING id, legacy_job_id, project_id, workflow_instance_id, provider, model, capability, prompt,
              status, phase, progress, error, result_url, reference_files, source_payload, result_payload,
              metadata, attempts, created_at, updated_at, started_at, completed_at`,
    [
      payload.id,
      payload.legacyJobId ?? null,
      payload.projectId ?? null,
      payload.workflowInstanceId ?? null,
      String(payload.provider ?? 'unknown'),
      payload.model ?? null,
      String(payload.capability ?? 'video'),
      String(payload.prompt ?? ''),
      String(payload.status ?? 'QUEUED'),
      String(payload.phase ?? 'QUEUED'),
      Number(payload.progress ?? 0),
      payload.error ?? null,
      payload.resultUrl ?? null,
      JSON.stringify(asArray(payload.referenceFiles)),
      JSON.stringify(asObject(payload.sourcePayload)),
      JSON.stringify(asObject(payload.resultPayload)),
      JSON.stringify(asObject(payload.metadata)),
      Number(payload.attempts ?? 0),
      payload.createdAt ? toIsoString(payload.createdAt) : new Date().toISOString(),
      payload.updatedAt ? toIsoString(payload.updatedAt) : new Date().toISOString(),
      payload.startedAt ? toIsoString(payload.startedAt) : null,
      payload.completedAt ? toIsoString(payload.completedAt) : null,
    ],
  );

  return mapGenerationJobRow(result.rows[0], { includeReferencePaths: true });
}

async function syncGenerationJobFromJimengRow(client, row) {
  return upsertGenerationJob(client, mapGenerationJobInputFromJimengRow(row));
}

async function setNodeInputs(client, nodeId, inputs) {
  await client.query(
    `UPDATE nodes
     SET inputs = $2::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [nodeId, JSON.stringify(inputs)],
  );
}

async function addInputToNode(client, nodeId, inputNodeId) {
  const node = await getNodeRow(client, nodeId);
  if (!node) {
    return;
  }

  const currentInputs = asArray(node.inputs);
  const nextInputs = appendUniqueValue(currentInputs, inputNodeId);
  if (nextInputs.length === currentInputs.length) {
    return;
  }

  await setNodeInputs(client, nodeId, nextInputs);
}

async function removeInputFromNode(client, nodeId, inputNodeId) {
  const node = await getNodeRow(client, nodeId);
  if (!node) {
    return;
  }

  const currentInputs = asArray(node.inputs);
  const nextInputs = removeValue(currentInputs, inputNodeId);
  if (nextInputs.length === currentInputs.length) {
    return;
  }

  await setNodeInputs(client, nodeId, nextInputs);
}

async function removeInputFromProjectNodes(client, projectId, inputNodeId) {
  const result = await client.query(
    `SELECT id
     FROM nodes
     WHERE project_id = $1
       AND inputs @> $2::jsonb`,
    [projectId, JSON.stringify([inputNodeId])],
  );

  for (const row of result.rows) {
    await removeInputFromNode(client, row.id, inputNodeId);
  }
}

export async function listProjects() {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, title, settings, workflow_state, created_at, updated_at
     FROM projects
     ORDER BY updated_at DESC`,
  );
  const loadedCollections = await loadPersistedWorkflowCollectionsByProjectIds(
    pool,
    result.rows.map((row) => row.id),
  );

  return result.rows.map((row) => {
    const settings = asObject(row.settings);
    const workflowState = getHydratedWorkflowProjectState(
      row,
      getPersistedWorkflowCollectionsForProject(loadedCollections, row.id),
      settings,
    );

    return mapProjectSummary(row, { settings, workflowState });
  });
}

export async function getProjectById(id) {
  const pool = getPool();
  const projectResult = await pool.query(
    `SELECT id, title, settings, workflow_state, groups, created_at, updated_at
     FROM projects
     WHERE id = $1`,
    [id],
  );

  const project = projectResult.rows[0];
  if (!project) {
    return null;
  }
  const settings = asObject(project.settings);
  const loadedCollections = await loadPersistedWorkflowCollectionsByProjectIds(pool, [id]);
  const workflowState = getHydratedWorkflowProjectState(
    project,
    getPersistedWorkflowCollectionsForProject(loadedCollections, id),
    settings,
  );

  const [nodesResult, connectionsResult] = await Promise.all([
    pool.query(
      `SELECT id, project_id, type, title, x, y, width, height, status, data, inputs, created_at, updated_at
       FROM nodes
       WHERE project_id = $1
       ORDER BY created_at ASC`,
      [id],
    ),
    pool.query(
      `SELECT id, project_id, from_node, to_node, created_at
       FROM connections
       WHERE project_id = $1
       ORDER BY created_at ASC`,
      [id],
    ),
  ]);

  return {
    ...mapProjectSummary(project, { settings, workflowState }),
    nodes: nodesResult.rows.map(mapNode),
    connections: connectionsResult.rows.map(mapConnection),
    groups: asArray(project.groups),
    episodes: loadedCollections.episodesByProjectId.get(id) ?? [],
  };
}

export async function getProjectDashboardById(id) {
  const pool = getPool();
  const projectResult = await pool.query(
    `SELECT id, title, settings, workflow_state, created_at, updated_at
     FROM projects
     WHERE id = $1`,
    [id],
  );

  const project = projectResult.rows[0];
  if (!project) {
    return null;
  }

  const settings = asObject(project.settings);
  const loadedCollections = await loadPersistedWorkflowCollectionsByProjectIds(pool, [id]);
  const workflowState = getHydratedWorkflowProjectState(
    project,
    getPersistedWorkflowCollectionsForProject(loadedCollections, id),
    settings,
  );

  return mapProjectSummary(project, { settings, workflowState }).dashboard;
}

export async function createProject(title, settings = {}, workflowState) {
  return withTransaction(async (client) => {
    const id = createProjectId();
    const normalizedSettings = asObject(settings);
    const normalizedWorkflowState = resolveWorkflowState(
      { workflow_state: workflowState, settings: normalizedSettings },
      normalizedSettings,
    );
    const result = await client.query(
      `INSERT INTO projects (id, title, settings, workflow_state, workflow_entities_version, groups)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, '[]'::jsonb)
       RETURNING id, title, settings, workflow_state, created_at, updated_at`,
      [
        id,
        title,
        JSON.stringify(normalizedSettings),
        JSON.stringify(normalizedWorkflowState),
        WORKFLOW_ENTITY_SCHEMA_VERSION,
      ],
    );

    await syncProjectWorkflowEntities(client, id, normalizedWorkflowState);

    return mapProjectSummary(result.rows[0], {
      settings: normalizedSettings,
      workflowState: getHydratedWorkflowProjectState(
        result.rows[0],
        getWorkflowProjectState({ workflow_state: normalizedWorkflowState }),
        normalizedSettings,
      ),
    });
  });
}

export async function updateProject(id, updates) {
  return withTransaction(async (client) => {
    const existing = await getProjectRow(client, id);
    if (!existing) {
      return null;
    }

    const nextSettings = updates.settings ?? asObject(existing.settings);
    const nextWorkflowState = updates.workflow_state === undefined
      ? resolveWorkflowState(existing, nextSettings)
      : asObject(updates.workflow_state);

    await syncProjectWorkflowEntities(client, id, nextWorkflowState);

    const result = await client.query(
      `UPDATE projects
       SET title = $2,
           settings = $3::jsonb,
           workflow_state = $4::jsonb,
           workflow_entities_version = $5,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, settings, workflow_state, created_at, updated_at`,
      [
        id,
        updates.title ?? existing.title,
        JSON.stringify(nextSettings),
        JSON.stringify(nextWorkflowState),
        WORKFLOW_ENTITY_SCHEMA_VERSION,
      ],
    );

    const loadedCollections = await loadPersistedWorkflowCollectionsByProjectIds(client, [id]);

    return mapProjectSummary(result.rows[0], {
      settings: nextSettings,
      workflowState: getHydratedWorkflowProjectState(
        result.rows[0],
        getPersistedWorkflowCollectionsForProject(loadedCollections, id),
        nextSettings,
      ),
    });
  });
}

export async function listWorkflowInstancesByProjectId(projectId) {
  const pool = getPool();
  const workflowInstancesByProjectId = await listWorkflowInstancesForProjectIds(pool, [projectId]);
  const workflowInstances = workflowInstancesByProjectId.get(projectId);
  if (workflowInstances && workflowInstances.length > 0) {
    return workflowInstances;
  }

  const workflowState = await getHydratedWorkflowStateByProjectId(pool, projectId);
  return workflowState?.instances ?? [];
}

export async function listEpisodesByProjectId(projectId) {
  const pool = getPool();
  const episodesByProjectId = await listEpisodesForProjectIds(pool, [projectId]);
  const episodes = episodesByProjectId.get(projectId);
  if (episodes && episodes.length > 0) {
    return episodes;
  }

  const workflowState = await getHydratedWorkflowStateByProjectId(pool, projectId);
  return buildEpisodesFromWorkflowState(projectId, workflowState);
}

export async function listAssetsByProjectId(projectId) {
  const pool = getPool();
  const assetsByProjectId = await listAssetsForProjectIds(pool, [projectId]);
  const assets = assetsByProjectId.get(projectId);
  if (assets && assets.length > 0) {
    return assets;
  }

  const workflowState = await getHydratedWorkflowStateByProjectId(pool, projectId);
  return workflowState?.assets ?? [];
}

export async function listAssetVersionsByProjectId(projectId) {
  const pool = getPool();
  const assetVersionsByProjectId = await listAssetVersionsForProjectIds(pool, [projectId]);
  const assetVersions = assetVersionsByProjectId.get(projectId);
  if (assetVersions && assetVersions.length > 0) {
    return assetVersions;
  }

  const workflowState = await getHydratedWorkflowStateByProjectId(pool, projectId);
  return workflowState?.assetVersions ?? [];
}

export async function listEpisodeAssetBindingsByProjectId(projectId) {
  const pool = getPool();
  const assetBindingsByProjectId = await listEpisodeAssetBindingsForProjectIds(pool, [projectId]);
  const assetBindings = assetBindingsByProjectId.get(projectId);
  if (assetBindings && assetBindings.length > 0) {
    return assetBindings;
  }

  const workflowState = await getHydratedWorkflowStateByProjectId(pool, projectId);
  return workflowState?.assetBindings ?? [];
}

export async function listEpisodeAssetBindingsByWorkflowInstanceId(workflowInstanceId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, project_id, workflow_instance_id, asset_id, version_id, mode, derived_from_version_id, created_at
     FROM episode_asset_bindings
     WHERE workflow_instance_id = $1
     ORDER BY created_at ASC, id ASC`,
    [workflowInstanceId],
  );

  return result.rows.map(mapEpisodeAssetBindingRow);
}

export async function listContinuityStatesByProjectId(projectId) {
  const pool = getPool();
  const continuityStatesByProjectId = await listContinuityStatesForProjectIds(pool, [projectId]);
  const continuityStates = continuityStatesByProjectId.get(projectId);
  if (continuityStates && continuityStates.length > 0) {
    return continuityStates;
  }

  const workflowState = await getHydratedWorkflowStateByProjectId(pool, projectId);
  return workflowState?.continuityStates ?? [];
}

export async function getProjectWorkflowEntitiesById(projectId) {
  const pool = getPool();
  const project = await getProjectRow(pool, projectId);
  if (!project) {
    return null;
  }

  const settings = asObject(project.settings);
  const loadedCollections = await loadPersistedWorkflowCollectionsByProjectIds(pool, [projectId]);
  const workflowState = getHydratedWorkflowProjectState(
    project,
    getPersistedWorkflowCollectionsForProject(loadedCollections, projectId),
    settings,
  );
  const [stageRunsByProjectId, shotsByProjectId, shotOutputsByProjectId] = await Promise.all([
    listWorkflowStageRunsForProjectIds(pool, [projectId]),
    listShotsForProjectIds(pool, [projectId]),
    listShotOutputsForProjectIds(pool, [projectId]),
  ]);

  return {
    instances: workflowState.instances,
    episodes: loadedCollections.episodesByProjectId.get(projectId) ?? buildEpisodesFromWorkflowState(projectId, workflowState),
    assets: workflowState.assets,
    assetVersions: workflowState.assetVersions,
    assetBindings: workflowState.assetBindings,
    continuityStates: workflowState.continuityStates,
    stageRuns: stageRunsByProjectId.get(projectId) ?? [],
    shots: shotsByProjectId.get(projectId) ?? [],
    shotOutputs: shotOutputsByProjectId.get(projectId) ?? [],
  };
}

export async function listWorkflowStageRunsByWorkflowInstanceId(workflowInstanceId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, project_id, workflow_instance_id, stage_id, status, form_data, outputs, artifact_ids, error,
            started_at, completed_at, created_at, updated_at
     FROM workflow_stage_runs
     WHERE workflow_instance_id = $1
     ORDER BY created_at ASC, stage_id ASC`,
    [workflowInstanceId],
  );

  if ((result.rowCount ?? 0) > 0) {
    return result.rows.map(mapWorkflowStageRunRow);
  }

  const workflowInstance = await getWorkflowInstanceRow(pool, workflowInstanceId);
  if (!workflowInstance) {
    return [];
  }

  return buildWorkflowStageRunsFromInstances(
    workflowInstance.project_id,
    [mapWorkflowInstanceRow(workflowInstance)],
  );
}

export async function upsertWorkflowStageRunByWorkflowInstanceId(workflowInstanceId, stageId, patch = {}) {
  return withTransaction(async (client) => {
    const workflowInstance = await getWorkflowInstanceRow(client, workflowInstanceId);
    if (!workflowInstance) {
      return null;
    }

    const existing = await getWorkflowStageRunRow(client, workflowInstanceId, stageId);
    const stageStateFallback = asObject(asObject(workflowInstance.stage_states)[stageId]);
    const nextStatus = String(
      hasOwn(patch, 'status')
        ? patch.status
        : (existing?.status ?? stageStateFallback.status ?? 'not_started'),
    ).trim() || 'not_started';
    const nextUpdatedAt = hasOwn(patch, 'updatedAt')
      ? (patch.updatedAt ? toIsoString(patch.updatedAt) : new Date().toISOString())
      : new Date().toISOString();
    const nextPayload = {
      id: existing?.id ?? createWorkflowStageRunId(workflowInstanceId, stageId),
      projectId: workflowInstance.project_id,
      workflowInstanceId,
      stageId,
      status: nextStatus,
      formData: hasOwn(patch, 'formData')
        ? {
            ...asObject(existing?.form_data ?? stageStateFallback.formData),
            ...asObject(patch.formData),
          }
        : asObject(existing?.form_data ?? stageStateFallback.formData),
      outputs: hasOwn(patch, 'outputs')
        ? {
            ...asObject(existing?.outputs ?? stageStateFallback.outputs),
            ...asObject(patch.outputs),
          }
        : asObject(existing?.outputs ?? stageStateFallback.outputs),
      artifactIds: hasOwn(patch, 'artifactIds')
        ? asArray(patch.artifactIds)
        : asArray(existing?.artifact_ids ?? stageStateFallback.artifactIds),
      error: hasOwn(patch, 'error')
        ? (patch.error ?? null)
        : (existing?.error ?? stageStateFallback.error ?? null),
      startedAt: hasOwn(patch, 'startedAt')
        ? (patch.startedAt ? toIsoString(patch.startedAt) : null)
        : (
            existing?.started_at
              ? toIsoString(existing.started_at)
              : (stageStateFallback.startedAt ? toIsoString(stageStateFallback.startedAt) : null)
          ),
      completedAt: hasOwn(patch, 'completedAt')
        ? (patch.completedAt ? toIsoString(patch.completedAt) : null)
        : (
            existing?.completed_at
              ? toIsoString(existing.completed_at)
              : (stageStateFallback.completedAt ? toIsoString(stageStateFallback.completedAt) : null)
          ),
      createdAt: existing?.created_at
        ? toIsoString(existing.created_at)
        : (stageStateFallback.startedAt ? toIsoString(stageStateFallback.startedAt) : nextUpdatedAt),
      updatedAt: nextUpdatedAt,
    };

    const result = await client.query(
      `INSERT INTO workflow_stage_runs (
        id, project_id, workflow_instance_id, stage_id, status, form_data, outputs, artifact_ids, error,
        started_at, completed_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13
      )
      ON CONFLICT (workflow_instance_id, stage_id) DO UPDATE SET
        status = EXCLUDED.status,
        form_data = EXCLUDED.form_data,
        outputs = EXCLUDED.outputs,
        artifact_ids = EXCLUDED.artifact_ids,
        error = EXCLUDED.error,
        started_at = EXCLUDED.started_at,
        completed_at = EXCLUDED.completed_at,
        updated_at = EXCLUDED.updated_at
      RETURNING id, project_id, workflow_instance_id, stage_id, status, form_data, outputs, artifact_ids, error,
                started_at, completed_at, created_at, updated_at`,
      [
        nextPayload.id,
        nextPayload.projectId,
        nextPayload.workflowInstanceId,
        nextPayload.stageId,
        nextPayload.status,
        JSON.stringify(asObject(nextPayload.formData)),
        JSON.stringify(asObject(nextPayload.outputs)),
        JSON.stringify(asArray(nextPayload.artifactIds)),
        nextPayload.error,
        nextPayload.startedAt,
        nextPayload.completedAt,
        nextPayload.createdAt,
        nextPayload.updatedAt,
      ],
    );

    const projectId = await syncWorkflowInstanceStageState(client, workflowInstanceId, nextPayload);
    if (projectId) {
      await client.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [projectId]);
    }
    return mapWorkflowStageRunRow(result.rows[0]);
  });
}

export async function listShotsByWorkflowInstanceId(workflowInstanceId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, project_id, workflow_instance_id, stage_run_id, shot_number, title, source_node_id, source_page,
            panel_index, prompt, image_url, metadata, created_at, updated_at
     FROM shots
     WHERE workflow_instance_id = $1
     ORDER BY shot_number ASC, created_at ASC, id ASC`,
    [workflowInstanceId],
  );

  return result.rows.map(mapShotRow);
}

export async function createShotForWorkflowInstance(workflowInstanceId, payload = {}) {
  return withTransaction(async (client) => {
    const workflowInstance = await getWorkflowInstanceRow(client, workflowInstanceId);
    if (!workflowInstance) {
      return null;
    }

    const result = await client.query(
      `INSERT INTO shots (
        id, project_id, workflow_instance_id, stage_run_id, shot_number, title, source_node_id, source_page,
        panel_index, prompt, image_url, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14
      )
      RETURNING id, project_id, workflow_instance_id, stage_run_id, shot_number, title, source_node_id, source_page,
                panel_index, prompt, image_url, metadata, created_at, updated_at`,
      [
        payload.id ?? createShotId(),
        workflowInstance.project_id,
        workflowInstanceId,
        payload.stageRunId ?? null,
        Number(payload.shotNumber ?? 0),
        String(payload.title ?? ''),
        payload.sourceNodeId ?? null,
        payload.sourcePage == null ? null : Number(payload.sourcePage),
        payload.panelIndex == null ? null : Number(payload.panelIndex),
        String(payload.prompt ?? ''),
        payload.imageUrl ?? null,
        JSON.stringify(asObject(payload.metadata)),
        payload.createdAt ? toIsoString(payload.createdAt) : new Date().toISOString(),
        payload.updatedAt ? toIsoString(payload.updatedAt) : new Date().toISOString(),
      ],
    );

    await client.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [workflowInstance.project_id]);
    return mapShotRow(result.rows[0]);
  });
}

export async function updateShotById(id, patch = {}) {
  return withTransaction(async (client) => {
    const existing = await getShotRow(client, id);
    if (!existing) {
      return null;
    }

    const result = await client.query(
      `UPDATE shots
       SET stage_run_id = $2,
           shot_number = $3,
           title = $4,
           source_node_id = $5,
           source_page = $6,
           panel_index = $7,
           prompt = $8,
           image_url = $9,
           metadata = $10::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, project_id, workflow_instance_id, stage_run_id, shot_number, title, source_node_id, source_page,
                 panel_index, prompt, image_url, metadata, created_at, updated_at`,
      [
        id,
        hasOwn(patch, 'stageRunId') ? (patch.stageRunId ?? null) : existing.stage_run_id,
        Number(hasOwn(patch, 'shotNumber') ? patch.shotNumber : existing.shot_number),
        hasOwn(patch, 'title') ? String(patch.title ?? '') : existing.title,
        hasOwn(patch, 'sourceNodeId') ? (patch.sourceNodeId ?? null) : existing.source_node_id,
        hasOwn(patch, 'sourcePage')
          ? (patch.sourcePage == null ? null : Number(patch.sourcePage))
          : existing.source_page,
        hasOwn(patch, 'panelIndex')
          ? (patch.panelIndex == null ? null : Number(patch.panelIndex))
          : existing.panel_index,
        hasOwn(patch, 'prompt') ? String(patch.prompt ?? '') : existing.prompt,
        hasOwn(patch, 'imageUrl') ? (patch.imageUrl ?? null) : existing.image_url,
        JSON.stringify(
          hasOwn(patch, 'metadata')
            ? {
                ...asObject(existing.metadata),
                ...asObject(patch.metadata),
              }
            : asObject(existing.metadata),
        ),
      ],
    );

    await client.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [existing.project_id]);
    return mapShotRow(result.rows[0]);
  });
}

export async function deleteShotById(id) {
  return withTransaction(async (client) => {
    const existing = await getShotRow(client, id);
    if (!existing) {
      return false;
    }

    await client.query('DELETE FROM shots WHERE id = $1', [id]);
    await client.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [existing.project_id]);
    return true;
  });
}

export async function listShotOutputsByShotId(shotId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, project_id, workflow_instance_id, shot_id, generation_job_id, provider, output_type, label, url,
            thumbnail_url, metadata, is_selected, selected_at, created_at, updated_at
     FROM shot_outputs
     WHERE shot_id = $1
     ORDER BY is_selected DESC, created_at DESC, id ASC`,
    [shotId],
  );

  return result.rows.map(mapShotOutputRow);
}

export async function createShotOutputForShot(shotId, payload = {}) {
  return withTransaction(async (client) => {
    const shot = await getShotRow(client, shotId);
    if (!shot) {
      return null;
    }

    const shouldSelect = Boolean(payload.isSelected);
    if (shouldSelect) {
      await client.query(
        `UPDATE shot_outputs
         SET is_selected = FALSE,
             selected_at = NULL,
             updated_at = NOW()
         WHERE shot_id = $1`,
        [shotId],
      );
    }

    const selectedAt = shouldSelect
      ? (payload.selectedAt ? toIsoString(payload.selectedAt) : new Date().toISOString())
      : null;
    const result = await client.query(
      `INSERT INTO shot_outputs (
        id, project_id, workflow_instance_id, shot_id, generation_job_id, provider, output_type, label, url,
        thumbnail_url, metadata, is_selected, selected_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15
      )
      RETURNING id, project_id, workflow_instance_id, shot_id, generation_job_id, provider, output_type, label, url,
                thumbnail_url, metadata, is_selected, selected_at, created_at, updated_at`,
      [
        payload.id ?? createShotOutputId(),
        shot.project_id,
        hasOwn(payload, 'workflowInstanceId') ? (payload.workflowInstanceId ?? null) : shot.workflow_instance_id,
        shotId,
        payload.generationJobId ?? null,
        payload.provider ?? null,
        String(payload.outputType ?? 'image'),
        payload.label ?? null,
        String(payload.url ?? ''),
        payload.thumbnailUrl ?? null,
        JSON.stringify(asObject(payload.metadata)),
        shouldSelect,
        selectedAt,
        payload.createdAt ? toIsoString(payload.createdAt) : new Date().toISOString(),
        payload.updatedAt ? toIsoString(payload.updatedAt) : new Date().toISOString(),
      ],
    );

    await client.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [shot.project_id]);
    return mapShotOutputRow(result.rows[0]);
  });
}

export async function selectShotOutputById(id) {
  return withTransaction(async (client) => {
    const existing = await getShotOutputRow(client, id);
    if (!existing) {
      return null;
    }

    const selectedAt = new Date().toISOString();
    await client.query(
      `UPDATE shot_outputs
       SET is_selected = FALSE,
           selected_at = NULL,
           updated_at = NOW()
       WHERE shot_id = $1`,
      [existing.shot_id],
    );

    const result = await client.query(
      `UPDATE shot_outputs
       SET is_selected = TRUE,
           selected_at = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, project_id, workflow_instance_id, shot_id, generation_job_id, provider, output_type, label, url,
                 thumbnail_url, metadata, is_selected, selected_at, created_at, updated_at`,
      [id, selectedAt],
    );

    await client.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [existing.project_id]);
    return mapShotOutputRow(result.rows[0]);
  });
}

export async function getEpisodeWorkspaceByWorkflowInstanceId(workflowInstanceId) {
  const pool = getPool();
  const workflowInstance = await getWorkflowInstanceRow(pool, workflowInstanceId);
  if (!workflowInstance) {
    return null;
  }

  const [stageRuns, shots, shotOutputs, assetBindings] = await Promise.all([
    listWorkflowStageRunsByWorkflowInstanceId(workflowInstanceId),
    listShotsByWorkflowInstanceId(workflowInstanceId),
    pool.query(
      `SELECT id, project_id, workflow_instance_id, shot_id, generation_job_id, provider, output_type, label, url,
              thumbnail_url, metadata, is_selected, selected_at, created_at, updated_at
       FROM shot_outputs
       WHERE workflow_instance_id = $1
          OR shot_id IN (
            SELECT id
            FROM shots
            WHERE workflow_instance_id = $1
          )
       ORDER BY shot_id ASC, is_selected DESC, created_at DESC, id ASC`,
      [workflowInstanceId],
    ).then((result) => result.rows.map(mapShotOutputRow)),
    listEpisodeAssetBindingsByWorkflowInstanceId(workflowInstanceId),
  ]);

  return {
    workflowInstanceId,
    projectId: workflowInstance.project_id,
    assetBindings,
    stageRuns,
    shots,
    shotOutputs,
  };
}

export async function deleteProjectById(id) {
  const pool = getPool();
  await pool.query('DELETE FROM projects WHERE id = $1', [id]);
}

export async function saveProjectSnapshot(id, payload) {
  return withTransaction(async (client) => {
    const existing = await getProjectRow(client, id);
    if (!existing) {
      return false;
    }

    await client.query(
      `UPDATE projects
       SET groups = $2::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [id, JSON.stringify(asArray(payload.groups))],
    );

    await client.query('DELETE FROM connections WHERE project_id = $1', [id]);
    await client.query('DELETE FROM nodes WHERE project_id = $1', [id]);

    for (const node of asArray(payload.nodes)) {
      await client.query(
        `INSERT INTO nodes (
          id, project_id, type, title, x, y, width, height, status, data, inputs
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb
        )`,
        [
          node.id ?? createEntityId(),
          id,
          node.type,
          node.title ?? '',
          Number(node.x ?? 0),
          Number(node.y ?? 0),
          node.width ?? null,
          node.height ?? null,
          node.status ?? 'IDLE',
          JSON.stringify(asObject(node.data)),
          JSON.stringify(asArray(node.inputs)),
        ],
      );
    }

    for (const connection of asArray(payload.connections)) {
      await client.query(
        `INSERT INTO connections (id, project_id, from_node, to_node)
         VALUES ($1, $2, $3, $4)`,
        [
          connection.id ?? createEntityId(),
          id,
          connection.from,
          connection.to,
        ],
      );
    }

    return true;
  });
}

export async function createNodeForProject(payload) {
  const pool = getPool();
  const id = payload.id ?? createEntityId();
  const result = await pool.query(
    `INSERT INTO nodes (
      id, project_id, type, title, x, y, width, height, status, data, inputs
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb
    )
    RETURNING id, project_id, type, title, x, y, width, height, status, data, inputs, created_at, updated_at`,
    [
      id,
      payload.project_id,
      payload.type,
      payload.title ?? payload.type,
      Number(payload.x ?? 0),
      Number(payload.y ?? 0),
      payload.width ?? null,
      payload.height ?? null,
      payload.status ?? 'IDLE',
      JSON.stringify(asObject(payload.data)),
      JSON.stringify(asArray(payload.inputs)),
    ],
  );

  await pool.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [payload.project_id]);

  return mapNode(result.rows[0]);
}

export async function updateNodeById(id, updates) {
  return withTransaction(async (client) => {
    const existing = await getNodeRow(client, id);
    if (!existing) {
      return null;
    }

    const result = await client.query(
      `UPDATE nodes
       SET type = $2,
           title = $3,
           x = $4,
           y = $5,
           width = $6,
           height = $7,
           status = $8,
           data = $9::jsonb,
           inputs = $10::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, project_id, type, title, x, y, width, height, status, data, inputs, created_at, updated_at`,
      [
        id,
        updates.type ?? existing.type,
        updates.title ?? existing.title,
        Number(updates.x ?? existing.x ?? 0),
        Number(updates.y ?? existing.y ?? 0),
        updates.width ?? existing.width ?? null,
        updates.height ?? existing.height ?? null,
        updates.status ?? existing.status,
        JSON.stringify(updates.data ?? asObject(existing.data)),
        JSON.stringify(updates.inputs ?? asArray(existing.inputs)),
      ],
    );

    await client.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [existing.project_id]);

    return mapNode(result.rows[0]);
  });
}

export async function batchUpdateNodesById(nodes) {
  await withTransaction(async (client) => {
    for (const node of asArray(nodes)) {
      const existing = await getNodeRow(client, node.id);
      if (!existing) {
        continue;
      }

      await client.query(
        `UPDATE nodes
         SET x = $2,
             y = $3,
             width = $4,
             height = $5,
             data = $6::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [
          node.id,
          Number(node.x ?? existing.x ?? 0),
          Number(node.y ?? existing.y ?? 0),
          node.width ?? existing.width ?? null,
          node.height ?? existing.height ?? null,
          JSON.stringify(node.data ?? asObject(existing.data)),
        ],
      );

      await client.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [existing.project_id]);
    }
  });
}

export async function deleteNodeById(id) {
  await withTransaction(async (client) => {
    const existing = await getNodeRow(client, id);
    if (!existing) {
      return;
    }

    await client.query('DELETE FROM connections WHERE project_id = $1 AND (from_node = $2 OR to_node = $2)', [
      existing.project_id,
      id,
    ]);
    await client.query('DELETE FROM nodes WHERE id = $1', [id]);
    await removeInputFromProjectNodes(client, existing.project_id, id);
    await client.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [existing.project_id]);
  });
}

export async function createConnectionForProject(payload) {
  return withTransaction(async (client) => {
    const existingConnection = await client.query(
      `SELECT id, project_id, from_node, to_node, created_at
       FROM connections
       WHERE project_id = $1
         AND from_node = $2
         AND to_node = $3
       LIMIT 1`,
      [payload.project_id, payload.from_node, payload.to_node],
    );

    if (existingConnection.rows[0]) {
      await addInputToNode(client, payload.to_node, payload.from_node);
      await client.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [payload.project_id]);
      return mapConnection(existingConnection.rows[0]);
    }

    const id = payload.id ?? createEntityId();
    const result = await client.query(
      `INSERT INTO connections (id, project_id, from_node, to_node)
       VALUES ($1, $2, $3, $4)
       RETURNING id, project_id, from_node, to_node, created_at`,
      [id, payload.project_id, payload.from_node, payload.to_node],
    );

    await addInputToNode(client, payload.to_node, payload.from_node);
    await client.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [payload.project_id]);

    return mapConnection(result.rows[0]);
  });
}

export async function deleteConnectionById(id) {
  await withTransaction(async (client) => {
    const result = await client.query(
      'SELECT id, project_id, from_node, to_node FROM connections WHERE id = $1',
      [id],
    );
    const existing = result.rows[0];
    if (!existing) {
      return;
    }

    await client.query('DELETE FROM connections WHERE id = $1', [id]);
    await removeInputFromNode(client, existing.to_node, existing.from_node);
    await client.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [existing.project_id]);
  });
}

export async function listGenerationJobs(filters = {}) {
  const pool = getPool();
  const values = [];
  const conditions = [];

  if (typeof filters.provider === 'string' && filters.provider.trim()) {
    values.push(filters.provider.trim());
    conditions.push(`provider = $${values.length}`);
  }

  if (typeof filters.status === 'string' && filters.status.trim()) {
    values.push(filters.status.trim());
    conditions.push(`status = $${values.length}`);
  }

  if (typeof filters.projectId === 'string' && filters.projectId.trim()) {
    values.push(filters.projectId.trim());
    conditions.push(`project_id = $${values.length}`);
  }

  if (typeof filters.workflowInstanceId === 'string' && filters.workflowInstanceId.trim()) {
    values.push(filters.workflowInstanceId.trim());
    conditions.push(`workflow_instance_id = $${values.length}`);
  }

  const limit = Number.isFinite(Number(filters.limit))
    ? Math.max(1, Math.min(Number(filters.limit), 200))
    : 100;
  values.push(limit);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT id, legacy_job_id, project_id, workflow_instance_id, provider, model, capability, prompt,
            status, phase, progress, error, result_url, reference_files, source_payload, result_payload,
            metadata, attempts, created_at, updated_at, started_at, completed_at
     FROM generation_jobs
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values,
  );

  return result.rows.map((row) => mapGenerationJobRow(row));
}

export async function getGenerationJobById(id, options = {}) {
  const pool = getPool();
  const row = await getGenerationJobRow(pool, id);
  return row ? mapGenerationJobRow(row, options) : null;
}

function buildGenerationJobPayload(existing, patch = {}) {
  const nextStatus = normalizeGenerationJobStatus(
    hasOwn(patch, 'status') ? patch.status : existing?.status,
    'QUEUED',
  );
  const nextPhase = String(
    hasOwn(patch, 'phase')
      ? (patch.phase ?? nextStatus)
      : (existing?.phase ?? nextStatus),
  ).trim() || nextStatus;
  const existingMetadata = asObject(existing?.metadata);
  const existingSourcePayload = asObject(existing?.source_payload);
  const existingResultPayload = asObject(existing?.result_payload);
  const existingReferenceFiles = asArray(existing?.reference_files);
  const nextMetadata = hasOwn(patch, 'metadata')
    ? {
        ...existingMetadata,
        ...asObject(patch.metadata),
      }
    : existingMetadata;
  const nextSourcePayload = hasOwn(patch, 'sourcePayload')
    ? {
        ...existingSourcePayload,
        ...asObject(patch.sourcePayload),
      }
    : existingSourcePayload;
  const nextResultPayload = hasOwn(patch, 'resultPayload')
    ? {
        ...existingResultPayload,
        ...asObject(patch.resultPayload),
      }
    : existingResultPayload;
  const nextCreatedAt = hasOwn(patch, 'createdAt')
    ? (patch.createdAt ? toIsoString(patch.createdAt) : new Date().toISOString())
    : (existing?.created_at ? toIsoString(existing.created_at) : new Date().toISOString());
  const nextUpdatedAt = hasOwn(patch, 'updatedAt')
    ? (patch.updatedAt ? toIsoString(patch.updatedAt) : new Date().toISOString())
    : new Date().toISOString();
  const nextStartedAt = hasOwn(patch, 'startedAt')
    ? (patch.startedAt ? toIsoString(patch.startedAt) : null)
    : (
        existing?.started_at
          ? toIsoString(existing.started_at)
          : (isGenerationJobActiveStatus(nextStatus) && nextStatus !== 'QUEUED' ? nextUpdatedAt : null)
      );
  const nextCompletedAt = hasOwn(patch, 'completedAt')
    ? (patch.completedAt ? toIsoString(patch.completedAt) : null)
    : (
        existing?.completed_at
          ? toIsoString(existing.completed_at)
          : (isGenerationJobTerminalStatus(nextStatus) ? nextUpdatedAt : null)
      );

  return {
    id: patch.id ?? existing?.id ?? createGenerationJobId(patch.provider ?? existing?.provider),
    legacyJobId: hasOwn(patch, 'legacyJobId') ? patch.legacyJobId : (existing?.legacy_job_id ?? null),
    projectId: hasOwn(patch, 'projectId') ? patch.projectId : (existing?.project_id ?? null),
    workflowInstanceId: hasOwn(patch, 'workflowInstanceId')
      ? patch.workflowInstanceId
      : (existing?.workflow_instance_id ?? null),
    provider: String(
      hasOwn(patch, 'provider') ? patch.provider : (existing?.provider ?? 'unknown'),
    ).trim() || 'unknown',
    model: hasOwn(patch, 'model') ? (patch.model ?? null) : (existing?.model ?? null),
    capability: String(
      hasOwn(patch, 'capability') ? patch.capability : (existing?.capability ?? 'video'),
    ).trim() || 'video',
    prompt: String(
      hasOwn(patch, 'prompt') ? patch.prompt : (existing?.prompt ?? ''),
    ),
    status: nextStatus,
    phase: nextPhase,
    progress: Number(
      hasOwn(patch, 'progress') ? patch.progress : (existing?.progress ?? 0),
    ),
    error: hasOwn(patch, 'error') ? (patch.error ?? null) : (existing?.error ?? null),
    resultUrl: hasOwn(patch, 'resultUrl') ? (patch.resultUrl ?? null) : (existing?.result_url ?? null),
    referenceFiles: hasOwn(patch, 'referenceFiles') ? asArray(patch.referenceFiles) : existingReferenceFiles,
    sourcePayload: nextSourcePayload,
    resultPayload: nextResultPayload,
    metadata: nextMetadata,
    attempts: Number(
      hasOwn(patch, 'attempts') ? patch.attempts : (existing?.attempts ?? 0),
    ),
    createdAt: nextCreatedAt,
    updatedAt: nextUpdatedAt,
    startedAt: nextStartedAt,
    completedAt: nextCompletedAt,
  };
}

export async function createGenerationJob(payload = {}) {
  return withTransaction(async (client) => {
    const nextPayload = buildGenerationJobPayload(null, payload);
    const row = await upsertGenerationJob(client, nextPayload);
    return mapGenerationJobRow(row);
  });
}

export async function updateGenerationJobById(id, patch = {}) {
  return withTransaction(async (client) => {
    const existing = await getGenerationJobRow(client, id);
    if (!existing) {
      return null;
    }

    const nextPayload = buildGenerationJobPayload(existing, { ...patch, id });
    const row = await upsertGenerationJob(client, nextPayload);
    return mapGenerationJobRow(row);
  });
}

export async function createJimengJob(payload) {
  return withTransaction(async (client) => {
    const id = payload.id ?? createJimengJobId();
    const referenceFiles = asArray(payload.referenceFiles).map((file) => ({
      path: file.path,
      mimetype: file.mimetype,
      originalname: file.originalname,
      size: Number(file.size ?? 0),
    }));
    const metadata = asObject(payload.metadata);

    const result = await client.query(
      `INSERT INTO jimeng_jobs (
        id, prompt, status, phase, progress, reference_files, metadata
      ) VALUES (
        $1, $2, 'QUEUED', 'QUEUED', 0, $3::jsonb, $4::jsonb
      )
      RETURNING id, prompt, status, phase, progress, error, result_video_url, reference_files, metadata, attempts,
                created_at, updated_at, started_at, completed_at`,
      [id, String(payload.prompt || '').trim(), JSON.stringify(referenceFiles), JSON.stringify(metadata)],
    );

    await syncGenerationJobFromJimengRow(client, result.rows[0]);
    return mapJimengJob(result.rows[0]);
  });
}

export async function getJimengJobById(id, options = {}) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, prompt, status, phase, progress, error, result_video_url, reference_files, metadata, attempts,
            created_at, updated_at, started_at, completed_at
     FROM jimeng_jobs
     WHERE id = $1`,
    [id],
  );

  const row = result.rows[0];
  return row ? mapJimengJob(row, options) : null;
}

export async function cancelJimengJobById(id, updates = {}) {
  return withTransaction(async (client) => {
    const existing = await getJimengJobRow(client, id);
    if (!existing) {
      return null;
    }

    const nextMetadata = {
      ...asObject(existing.metadata),
      ...asObject(updates.metadata),
    };

    const result = await client.query(
      `UPDATE jimeng_jobs
       SET status = 'CANCELLED',
           phase = 'CANCELLED',
           error = $2,
           metadata = $3::jsonb,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, prompt, status, phase, progress, error, result_video_url, reference_files, metadata, attempts,
                 created_at, updated_at, started_at, completed_at`,
      [
        id,
        updates.error ?? existing.error ?? 'Jimeng job cancelled.',
        JSON.stringify(nextMetadata),
      ],
    );

    await syncGenerationJobFromJimengRow(client, result.rows[0]);
    return mapJimengJob(result.rows[0]);
  });
}

export async function requeueJimengJobById(id, updates = {}) {
  return withTransaction(async (client) => {
    const existing = await getJimengJobRow(client, id);
    if (!existing) {
      return null;
    }

    const nextMetadata = {
      ...asObject(existing.metadata),
      ...asObject(updates.metadata),
    };

    const result = await client.query(
      `UPDATE jimeng_jobs
       SET status = 'QUEUED',
           phase = 'QUEUED',
           progress = 0,
           error = NULL,
           result_video_url = NULL,
           metadata = $2::jsonb,
           started_at = NULL,
           completed_at = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, prompt, status, phase, progress, error, result_video_url, reference_files, metadata, attempts,
                 created_at, updated_at, started_at, completed_at`,
      [id, JSON.stringify(nextMetadata)],
    );

    await syncGenerationJobFromJimengRow(client, result.rows[0]);
    return mapJimengJob(result.rows[0]);
  });
}

export async function retryJimengJobById(id, updates = {}) {
  return withTransaction(async (client) => {
    const existing = await getJimengJobRow(client, id);
    if (!existing) {
      return null;
    }

    const nextMetadata = {
      ...asObject(existing.metadata),
      ...asObject(updates.metadata),
      retryOf: id,
    };
    const nextId = createJimengJobId();

    const result = await client.query(
      `INSERT INTO jimeng_jobs (
        id, prompt, status, phase, progress, reference_files, metadata
      ) VALUES (
        $1, $2, 'QUEUED', 'QUEUED', 0, $3::jsonb, $4::jsonb
      )
      RETURNING id, prompt, status, phase, progress, error, result_video_url, reference_files, metadata, attempts,
                created_at, updated_at, started_at, completed_at`,
      [
        nextId,
        existing.prompt,
        JSON.stringify(asArray(existing.reference_files)),
        JSON.stringify(nextMetadata),
      ],
    );

    await syncGenerationJobFromJimengRow(client, result.rows[0]);
    return mapJimengJob(result.rows[0]);
  });
}

export async function cancelGenerationJobById(id, updates = {}) {
  const pool = getPool();
  const existing = await getGenerationJobRow(pool, id);
  if (!existing) {
    return null;
  }

  if (existing.provider === 'jimeng') {
    const jimengJob = await cancelJimengJobById(id, updates);
    return jimengJob ? getGenerationJobById(jimengJob.id) : null;
  }

  return withTransaction(async (client) => {
    const nextPayload = buildGenerationJobPayload(existing, {
      status: 'CANCELLED',
      phase: 'CANCELLED',
      error: updates.error ?? existing.error ?? 'Generation job cancelled.',
      metadata: {
        ...asObject(updates.metadata),
        cancelledAt: new Date().toISOString(),
      },
    });
    const row = await upsertGenerationJob(client, nextPayload);
    return mapGenerationJobRow(row);
  });
}

export async function requeueGenerationJobById(id, updates = {}) {
  const pool = getPool();
  const existing = await getGenerationJobRow(pool, id);
  if (!existing) {
    return null;
  }

  if (existing.provider === 'jimeng') {
    const jimengJob = await requeueJimengJobById(id, updates);
    return jimengJob ? getGenerationJobById(jimengJob.id) : null;
  }

  return withTransaction(async (client) => {
    const nextPayload = buildGenerationJobPayload(existing, {
      status: 'QUEUED',
      phase: 'QUEUED',
      progress: 0,
      error: null,
      resultUrl: null,
      resultPayload: {},
      metadata: {
        ...asObject(updates.metadata),
        requeuedAt: new Date().toISOString(),
      },
      startedAt: null,
      completedAt: null,
    });
    const row = await upsertGenerationJob(client, nextPayload);
    return mapGenerationJobRow(row);
  });
}

export async function retryGenerationJobById(id, updates = {}) {
  const pool = getPool();
  const existing = await getGenerationJobRow(pool, id);
  if (!existing) {
    return null;
  }

  if (existing.provider === 'jimeng') {
    const jimengJob = await retryJimengJobById(id, updates);
    return jimengJob ? getGenerationJobById(jimengJob.id) : null;
  }

  return withTransaction(async (client) => {
    const nextPayload = buildGenerationJobPayload(null, {
      id: createGenerationJobId(existing.provider),
      legacyJobId: existing.legacy_job_id ?? null,
      projectId: existing.project_id ?? null,
      workflowInstanceId: existing.workflow_instance_id ?? null,
      provider: existing.provider,
      model: existing.model ?? null,
      capability: existing.capability,
      prompt: existing.prompt,
      status: 'QUEUED',
      phase: 'QUEUED',
      progress: 0,
      error: null,
      resultUrl: null,
      referenceFiles: asArray(existing.reference_files),
      sourcePayload: asObject(existing.source_payload),
      resultPayload: {},
      metadata: {
        ...asObject(existing.metadata),
        ...asObject(updates.metadata),
        retryOf: id,
      },
      attempts: 0,
      startedAt: null,
      completedAt: null,
    });
    const row = await upsertGenerationJob(client, nextPayload);
    return mapGenerationJobRow(row);
  });
}

export async function requeueRunningJimengJobs() {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE jimeng_jobs
     SET status = 'QUEUED',
         phase = 'QUEUED',
         progress = CASE
           WHEN progress < 10 THEN progress
           ELSE 10
         END,
         error = NULL,
         updated_at = NOW()
     WHERE status = 'RUNNING'
     RETURNING id, prompt, status, phase, progress, error, result_video_url, reference_files, metadata, attempts,
               created_at, updated_at, started_at, completed_at`,
  );

  if ((result.rowCount ?? 0) > 0) {
    await withTransaction(async (client) => {
      for (const row of result.rows) {
        await syncGenerationJobFromJimengRow(client, row);
      }
    });
  }

  return result.rowCount ?? 0;
}

export async function claimNextJimengJob() {
  return withTransaction(async (client) => {
    const selectResult = await client.query(
      `SELECT id
       FROM jimeng_jobs
       WHERE status = 'QUEUED'
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    );

    const nextJob = selectResult.rows[0];
    if (!nextJob) {
      return null;
    }

    const result = await client.query(
      `UPDATE jimeng_jobs
       SET status = 'RUNNING',
           phase = 'STARTING',
           progress = CASE
             WHEN progress < 5 THEN 5
             ELSE progress
           END,
           attempts = attempts + 1,
           started_at = COALESCE(started_at, NOW()),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, prompt, status, phase, progress, error, result_video_url, reference_files, metadata, attempts,
                 created_at, updated_at, started_at, completed_at`,
      [nextJob.id],
    );

    await syncGenerationJobFromJimengRow(client, result.rows[0]);
    return mapJimengJob(result.rows[0], { includeReferencePaths: true });
  });
}

export async function updateJimengJobProgress(id, updates = {}) {
  return withTransaction(async (client) => {
    const existing = await getJimengJobRow(client, id);
    if (!existing) {
      return null;
    }

    const nextMetadata = {
      ...asObject(existing.metadata),
      ...asObject(updates.metadata),
    };

    const result = await client.query(
      `UPDATE jimeng_jobs
       SET status = $2,
           phase = $3,
           progress = $4,
           error = $5,
           metadata = $6::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, prompt, status, phase, progress, error, result_video_url, reference_files, metadata, attempts,
                 created_at, updated_at, started_at, completed_at`,
      [
        id,
        updates.status ?? existing.status,
        updates.phase ?? existing.phase,
        Number(updates.progress ?? existing.progress ?? 0),
        Object.prototype.hasOwnProperty.call(updates, 'error') ? (updates.error ?? null) : existing.error,
        JSON.stringify(nextMetadata),
      ],
    );

    await syncGenerationJobFromJimengRow(client, result.rows[0]);
    return mapJimengJob(result.rows[0]);
  });
}

export async function markJimengJobSucceeded(id, updates = {}) {
  return withTransaction(async (client) => {
    const existing = await getJimengJobRow(client, id);
    if (!existing) {
      return null;
    }

    const nextMetadata = {
      ...asObject(existing.metadata),
      ...asObject(updates.metadata),
    };

    const result = await client.query(
      `UPDATE jimeng_jobs
       SET status = 'SUCCEEDED',
           phase = 'SUCCEEDED',
           progress = 100,
           error = NULL,
           result_video_url = $2,
           metadata = $3::jsonb,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, prompt, status, phase, progress, error, result_video_url, reference_files, metadata, attempts,
                 created_at, updated_at, started_at, completed_at`,
      [id, updates.videoUrl ?? existing.result_video_url ?? null, JSON.stringify(nextMetadata)],
    );

    await syncGenerationJobFromJimengRow(client, result.rows[0]);
    return mapJimengJob(result.rows[0]);
  });
}

export async function markJimengJobFailed(id, updates = {}) {
  return withTransaction(async (client) => {
    const existing = await getJimengJobRow(client, id);
    if (!existing) {
      return null;
    }

    const nextMetadata = {
      ...asObject(existing.metadata),
      ...asObject(updates.metadata),
    };

    const result = await client.query(
      `UPDATE jimeng_jobs
       SET status = 'FAILED',
           phase = $2,
           progress = $3,
           error = $4,
           metadata = $5::jsonb,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, prompt, status, phase, progress, error, result_video_url, reference_files, metadata, attempts,
                 created_at, updated_at, started_at, completed_at`,
      [
        id,
        updates.phase ?? 'FAILED',
        Number(updates.progress ?? existing.progress ?? 0),
        updates.error ?? existing.error ?? 'Jimeng job failed.',
        JSON.stringify(nextMetadata),
      ],
    );

    await syncGenerationJobFromJimengRow(client, result.rows[0]);
    return mapJimengJob(result.rows[0]);
  });
}
