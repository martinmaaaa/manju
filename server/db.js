import pg from 'pg';

const { Pool } = pg;

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/aiyou';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS workflow_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES workflow_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_sessions_user_id
  ON workflow_sessions(user_id);

CREATE TABLE IF NOT EXISTS workflow_projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES workflow_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES workflow_projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES workflow_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_project_members_user_id
  ON workflow_project_members(user_id);

CREATE TABLE IF NOT EXISTS workflow_script_sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES workflow_projects(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  mime_type TEXT,
  original_name TEXT,
  content_text TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL REFERENCES workflow_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_script_sources_project_id
  ON workflow_script_sources(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_project_setups (
  project_id TEXT PRIMARY KEY REFERENCES workflow_projects(id) ON DELETE CASCADE,
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  style_summary TEXT NOT NULL DEFAULT '',
  target_medium TEXT NOT NULL DEFAULT '漫剧',
  global_prompts JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  stage_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_story_bibles (
  project_id TEXT PRIMARY KEY REFERENCES workflow_projects(id) ON DELETE CASCADE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES workflow_projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('character', 'scene', 'prop', 'style')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_by TEXT REFERENCES workflow_users(id) ON DELETE SET NULL,
  locked_at TIMESTAMPTZ,
  current_version_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, type, name)
);

CREATE INDEX IF NOT EXISTS idx_workflow_assets_project_id
  ON workflow_assets(project_id, type);

CREATE TABLE IF NOT EXISTS workflow_asset_versions (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES workflow_assets(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES workflow_projects(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  prompt_text TEXT NOT NULL DEFAULT '',
  preview_url TEXT,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT REFERENCES workflow_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(asset_id, version_number)
);

CREATE TABLE IF NOT EXISTS workflow_episodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES workflow_projects(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  synopsis TEXT NOT NULL DEFAULT '',
  source_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, episode_number)
);

CREATE INDEX IF NOT EXISTS idx_workflow_episodes_project_id
  ON workflow_episodes(project_id, episode_number);

CREATE TABLE IF NOT EXISTS workflow_episode_contexts (
  episode_id TEXT PRIMARY KEY REFERENCES workflow_episodes(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES workflow_projects(id) ON DELETE CASCADE,
  context_summary TEXT NOT NULL DEFAULT '',
  preceding_summary TEXT NOT NULL DEFAULT '',
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_episode_workspaces (
  episode_id TEXT PRIMARY KEY REFERENCES workflow_episodes(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES workflow_projects(id) ON DELETE CASCADE,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_studio_workspaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES workflow_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_assets JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_studio_workspaces_user_id
  ON workflow_studio_workspaces(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS workflow_capability_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES workflow_projects(id) ON DELETE CASCADE,
  episode_id TEXT REFERENCES workflow_episodes(id) ON DELETE CASCADE,
  capability_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  skill_pack_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_capability_runs_project_id
  ON workflow_capability_runs(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES workflow_projects(id) ON DELETE CASCADE,
  stage_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  capability_run_id TEXT REFERENCES workflow_capability_runs(id) ON DELETE SET NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
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
