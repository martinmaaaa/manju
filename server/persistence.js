import { randomUUID } from 'crypto';
import { getPool } from './db.js';

function createProjectId() {
  return `proj_${randomUUID().replace(/-/g, '')}`;
}

function createEntityId() {
  return randomUUID().replace(/-/g, '');
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

function appendUniqueValue(values, value) {
  return values.includes(value) ? values : [...values, value];
}

function removeValue(values, value) {
  return values.filter((item) => item !== value);
}

function mapProjectSummary(row) {
  return {
    id: row.id,
    title: row.title,
    settings: asObject(row.settings),
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

async function getProjectRow(client, id) {
  const result = await client.query(
    `SELECT id, title, settings, groups, created_at, updated_at
     FROM projects
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
    `SELECT id, title, settings, created_at, updated_at
     FROM projects
     ORDER BY updated_at DESC`,
  );

  return result.rows.map(mapProjectSummary);
}

export async function getProjectById(id) {
  const pool = getPool();
  const projectResult = await pool.query(
    `SELECT id, title, settings, groups, created_at, updated_at
     FROM projects
     WHERE id = $1`,
    [id],
  );

  const project = projectResult.rows[0];
  if (!project) {
    return null;
  }

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
    ...mapProjectSummary(project),
    nodes: nodesResult.rows.map(mapNode),
    connections: connectionsResult.rows.map(mapConnection),
    groups: asArray(project.groups),
  };
}

export async function createProject(title) {
  const pool = getPool();
  const id = createProjectId();
  const result = await pool.query(
    `INSERT INTO projects (id, title, settings, groups)
     VALUES ($1, $2, '{}'::jsonb, '[]'::jsonb)
     RETURNING id, title, settings, created_at, updated_at`,
    [id, title],
  );

  return mapProjectSummary(result.rows[0]);
}

export async function updateProject(id, updates) {
  return withTransaction(async (client) => {
    const existing = await getProjectRow(client, id);
    if (!existing) {
      return null;
    }

    const result = await client.query(
      `UPDATE projects
       SET title = $2,
           settings = $3::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, title, settings, created_at, updated_at`,
      [
        id,
        updates.title ?? existing.title,
        JSON.stringify(updates.settings ?? asObject(existing.settings)),
      ],
    );

    return mapProjectSummary(result.rows[0]);
  });
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
