import pg from 'pg';

const { Pool } = pg;

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/aiyou';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  workflow_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  workflow_entities_version INTEGER NOT NULL DEFAULT 0,
  groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS workflow_state JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS workflow_entities_version INTEGER NOT NULL DEFAULT 0;

UPDATE projects
SET workflow_state = settings->'workflowState'
WHERE workflow_state = '{}'::jsonb
  AND jsonb_typeof(settings->'workflowState') = 'object';

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  width DOUBLE PRECISION,
  height DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'IDLE',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  inputs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nodes_project_id ON nodes(project_id);

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_node TEXT NOT NULL,
  to_node TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connections_project_id ON connections(project_id);

CREATE TABLE IF NOT EXISTS workflow_instances (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  parent_instance_id TEXT REFERENCES workflow_instances(id) ON DELETE CASCADE,
  current_stage_id TEXT,
  stage_states JSONB NOT NULL DEFAULT '{}'::jsonb,
  artifact_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_project_id
  ON workflow_instances(project_id);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_project_scope
  ON workflow_instances(project_id, scope);

CREATE TABLE IF NOT EXISTS episodes (
  workflow_instance_id TEXT PRIMARY KEY REFERENCES workflow_instances(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  series_instance_id TEXT REFERENCES workflow_instances(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  current_stage_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episodes_project_series_episode_number
  ON episodes(project_id, series_instance_id, episode_number);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  current_version_id TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_project_id
  ON assets(project_id);

CREATE INDEX IF NOT EXISTS idx_assets_project_type
  ON assets(project_id, type);

CREATE TABLE IF NOT EXISTS asset_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_pack JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_versions_project_id
  ON asset_versions(project_id);

CREATE INDEX IF NOT EXISTS idx_asset_versions_asset_id
  ON asset_versions(asset_id);

CREATE TABLE IF NOT EXISTS episode_asset_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_instance_id TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES asset_versions(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'follow_latest',
  derived_from_version_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_episode_asset_bindings_project_id
  ON episode_asset_bindings(project_id);

CREATE INDEX IF NOT EXISTS idx_episode_asset_bindings_workflow_instance_id
  ON episode_asset_bindings(workflow_instance_id);

CREATE TABLE IF NOT EXISTS continuity_states (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_instance_id TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_continuity_states_project_id
  ON continuity_states(project_id);

CREATE INDEX IF NOT EXISTS idx_continuity_states_workflow_instance_id
  ON continuity_states(workflow_instance_id);

CREATE TABLE IF NOT EXISTS workflow_stage_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_instance_id TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  outputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  artifact_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workflow_instance_id, stage_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_stage_runs_project_id
  ON workflow_stage_runs(project_id);

CREATE INDEX IF NOT EXISTS idx_workflow_stage_runs_workflow_instance_id
  ON workflow_stage_runs(workflow_instance_id);

CREATE TABLE IF NOT EXISTS shots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_instance_id TEXT NOT NULL,
  stage_run_id TEXT,
  shot_number INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  source_node_id TEXT,
  source_page INTEGER,
  panel_index INTEGER,
  prompt TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shots_project_id
  ON shots(project_id);

CREATE INDEX IF NOT EXISTS idx_shots_workflow_instance_id
  ON shots(workflow_instance_id, shot_number);

CREATE INDEX IF NOT EXISTS idx_shots_stage_run_id
  ON shots(stage_run_id);

CREATE TABLE IF NOT EXISTS shot_outputs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_instance_id TEXT,
  shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  generation_job_id TEXT REFERENCES generation_jobs(id) ON DELETE SET NULL,
  provider TEXT,
  output_type TEXT NOT NULL DEFAULT 'image',
  label TEXT,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_selected BOOLEAN NOT NULL DEFAULT FALSE,
  selected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shot_outputs_project_id
  ON shot_outputs(project_id);

CREATE INDEX IF NOT EXISTS idx_shot_outputs_shot_id
  ON shot_outputs(shot_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shot_outputs_generation_job_id
  ON shot_outputs(generation_job_id);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id TEXT PRIMARY KEY,
  legacy_job_id TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  workflow_instance_id TEXT REFERENCES workflow_instances(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT,
  capability TEXT NOT NULL DEFAULT 'video',
  prompt TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'QUEUED',
  phase TEXT NOT NULL DEFAULT 'QUEUED',
  progress INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  result_url TEXT,
  reference_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_status_created_at
  ON generation_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_provider_status
  ON generation_jobs(provider, status);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_project_id
  ON generation_jobs(project_id);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_workflow_instance_id
  ON generation_jobs(workflow_instance_id);

CREATE TABLE IF NOT EXISTS jimeng_jobs (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  phase TEXT NOT NULL DEFAULT 'QUEUED',
  progress INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  result_video_url TEXT,
  reference_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jimeng_jobs_status_created_at
  ON jimeng_jobs(status, created_at);
`;

let poolInstance = null;
let initPromise = null;
let databaseReady = false;

function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  });
}

export function getPool() {
  if (!poolInstance) {
    poolInstance = createPool();
  }

  return poolInstance;
}

export function getResolvedDatabaseUrl() {
  return process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
}

export async function initDatabase() {
  if (databaseReady) {
    return true;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const pool = getPool();
    await pool.query(SCHEMA_SQL);
    databaseReady = true;
    return true;
  })()
    .catch((error) => {
      databaseReady = false;
      throw error;
    })
    .finally(() => {
      initPromise = null;
    });

  return initPromise;
}

export async function ensureDatabaseReady() {
  if (databaseReady) {
    return true;
  }

  try {
    await initDatabase();
    return true;
  } catch {
    return false;
  }
}

export function markDatabaseUnavailable() {
  databaseReady = false;
}
