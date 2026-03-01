/**
 * 项目 API - CRUD 操作
 */

import { apiRequest, isApiAvailable } from './client';
import type { ApiResponse } from './client';
import type { AppNode, Connection, Group } from '../../types';
import { saveToStorage, loadFromStorage } from '../storage_old';
import { getFileStorageService } from '../storage';

// Helper for local file system generic read/write
async function writeToLocalFS(workspaceId: string, nodeId: string, filename: string, data: any) {
  const service = getFileStorageService();
  if (!service.isEnabled()) return false;

  try {
    const jsonStr = JSON.stringify(data, null, 2);
    // write file
    await service.saveFile(workspaceId, nodeId, "project_data", jsonStr, {
      customFileName: filename,
      overwrite: true,
      updateMetadata: false
    });
    return true;
  } catch (error) {
    console.error(`Failed to write ${filename} to local FS:`, error);
    return false;
  }
}

async function readFromLocalFS(workspaceId: string, nodeId: string, filename: string) {
  const service = getFileStorageService();
  if (!service.isEnabled()) return null;

  try {
    const relativePath = `${workspaceId}/project_data/${filename}`;
    const blob = await service.readFile(relativePath);
    const text = await blob.text();
    return JSON.parse(text);
  } catch (error) {
    // Expected if file doesn't exist yet
    return null;
  }
}

async function removeFromLocalFS(workspaceId: string, nodeId: string, filename: string) {
  const service = getFileStorageService();
  if (!service.isEnabled()) return false;

  try {
    const relativePath = `${workspaceId}/project_data/${filename}`;
    await service.deleteFile(relativePath);
    return true;
  } catch (error) {
    console.error(`Failed to remove ${filename} from local FS:`, error);
    return false;
  }
}

let _onlineCache: boolean | null = null;
async function checkOnline() {
  if (_onlineCache !== null) {
    return _onlineCache;
  }

  try {
    _onlineCache = await isApiAvailable();
  } catch (e) {
    console.warn("Online check failed", e);
    _onlineCache = false;
  }

  return _onlineCache;
}

export const LOCAL_PROJECTS_KEY = 'local_projects';

export interface ProjectSummary {
  id: string;
  title: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetail extends ProjectSummary {
  nodes: AppNode[];
  connections: Connection[];
  groups: Group[];
}

export interface SnapshotPayload {
  nodes: AppNode[];
  connections: Connection[];
  groups: Group[];
}

export async function getProjects(): Promise<ApiResponse<ProjectSummary[]>> {
  if (await checkOnline()) {
    const res = await apiRequest<ProjectSummary[]>('/projects');
    if (res.success) return res;
    console.warn("Online getProjects failed, falling back to local storage:", res.error);
  }
  // Pure local FS fallback
  const service = getFileStorageService();
  if (service.isEnabled()) {
    const localProjects = await readFromLocalFS('default', 'global', LOCAL_PROJECTS_KEY + '.json') as ProjectSummary[] || [];
    return { success: true, data: localProjects.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()) };
  }
  // IndexedDB fallback
  const projects = await loadFromStorage<ProjectSummary[]>(LOCAL_PROJECTS_KEY) || [];
  return { success: true, data: projects.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()) };
}

export async function getProject(id: string): Promise<ApiResponse<ProjectDetail>> {
  if (await checkOnline()) {
    const res = await apiRequest<ProjectDetail>(`/projects/${id}`);
    if (res.success) return res;
    console.warn(`Online getProject failed for ${id}, falling back to local storage:`, res.error);
  }

  const service = getFileStorageService();
  if (service.isEnabled()) {
    const localProjects = await readFromLocalFS('default', 'global', LOCAL_PROJECTS_KEY + '.json') as ProjectSummary[] || [];
    const project = localProjects.find(p => p.id === id);
    if (!project) return { success: false, error: 'Project not found in local FS' };

    const nodes = await readFromLocalFS('default', id, `nodes_${id}.json`) as AppNode[] || [];
    const connections = await readFromLocalFS('default', id, `connections_${id}.json`) as Connection[] || [];
    const groups = await readFromLocalFS('default', id, `groups_${id}.json`) as Group[] || [];

    return {
      success: true,
      data: {
        ...project,
        nodes,
        connections,
        groups
      }
    };
  }

  // IndexedDB fallback
  const projects = await loadFromStorage<ProjectSummary[]>(LOCAL_PROJECTS_KEY) || [];
  const project = projects.find(p => p.id === id);
  if (!project) return { success: false, error: 'Project not found' };

  // Try to load project specific data
  const nodes = await loadFromStorage<AppNode[]>(`nodes_${id}`) || [];
  const connections = await loadFromStorage<Connection[]>(`connections_${id}`) || [];
  const groups = await loadFromStorage<Group[]>(`groups_${id}`) || [];

  return {
    success: true,
    data: {
      ...project,
      nodes,
      connections,
      groups
    }
  };
}

export async function createProject(title: string): Promise<ApiResponse<ProjectSummary>> {
  if (await checkOnline()) {
    const res = await apiRequest<ProjectSummary>('/projects', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    if (res.success) return res;
    console.warn("Online createProject failed, falling back to local storage:", res.error);
  }

  const newProject: ProjectSummary = {
    id: `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    title,
    settings: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const service = getFileStorageService();
  if (service.isEnabled()) {
    const localProjects = await readFromLocalFS('default', 'global', LOCAL_PROJECTS_KEY + '.json') as ProjectSummary[] || [];
    localProjects.push(newProject);
    await writeToLocalFS('default', 'global', LOCAL_PROJECTS_KEY + '.json', localProjects);
    // Initialize empty arrays for project data
    await writeToLocalFS('default', newProject.id, `nodes_${newProject.id}.json`, []);
    await writeToLocalFS('default', newProject.id, `connections_${newProject.id}.json`, []);
    await writeToLocalFS('default', newProject.id, `groups_${newProject.id}.json`, []);

    return { success: true, data: newProject };
  }

  // IndexedDB fallback
  const projects = await loadFromStorage<ProjectSummary[]>(LOCAL_PROJECTS_KEY) || [];
  projects.push(newProject);
  await saveToStorage(LOCAL_PROJECTS_KEY, projects);
  return { success: true, data: newProject };
}

export async function updateProject(
  id: string,
  data: { title?: string; settings?: Record<string, unknown> },
): Promise<ApiResponse<ProjectSummary>> {
  if (await checkOnline()) {
    const res = await apiRequest<ProjectSummary>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (res.success) return res;
    console.warn(`Online updateProject failed for ${id}, falling back to local storage:`, res.error);
  }

  const service = getFileStorageService();
  if (service.isEnabled()) {
    const localProjects = await readFromLocalFS('default', 'global', LOCAL_PROJECTS_KEY + '.json') as ProjectSummary[] || [];
    const idx = localProjects.findIndex(p => p.id === id);
    if (idx === -1) return { success: false, error: 'Project not found in local FS' };

    localProjects[idx] = {
      ...localProjects[idx],
      ...data,
      updated_at: new Date().toISOString(),
    };
    await writeToLocalFS('default', 'global', LOCAL_PROJECTS_KEY + '.json', localProjects);
    return { success: true, data: localProjects[idx] };
  }

  // IndexedDB fallback
  const projects = await loadFromStorage<ProjectSummary[]>(LOCAL_PROJECTS_KEY) || [];
  const idx = projects.findIndex(p => p.id === id);
  if (idx === -1) return { success: false, error: 'Project not found' };

  projects[idx] = {
    ...projects[idx],
    ...data,
    updated_at: new Date().toISOString(),
  };
  await saveToStorage(LOCAL_PROJECTS_KEY, projects);
  return { success: true, data: projects[idx] };
}

export async function deleteProject(id: string): Promise<ApiResponse<void>> {
  if (await checkOnline()) {
    const res = await apiRequest<void>(`/projects/${id}`, { method: 'DELETE' });
    if (res.success) return res;
    console.warn(`Online deleteProject failed for ${id}, falling back to local storage:`, res.error);
  }

  const service = getFileStorageService();
  if (service.isEnabled()) {
    const localProjects = await readFromLocalFS('default', 'global', LOCAL_PROJECTS_KEY + '.json') as ProjectSummary[] || [];
    const newProjects = localProjects.filter(p => p.id !== id);
    await writeToLocalFS('default', 'global', LOCAL_PROJECTS_KEY + '.json', newProjects);
    // Remove related files
    await removeFromLocalFS('default', id, `nodes_${id}.json`);
    await removeFromLocalFS('default', id, `connections_${id}.json`);
    await removeFromLocalFS('default', id, `groups_${id}.json`);
    return { success: true };
  }

  // IndexedDB fallback
  const projects = await loadFromStorage<ProjectSummary[]>(LOCAL_PROJECTS_KEY) || [];
  const newProjects = projects.filter(p => p.id !== id);
  await saveToStorage(LOCAL_PROJECTS_KEY, newProjects);
  // Optional: clear related project data from IndexedDB
  return { success: true };
}

export async function saveProjectSnapshot(
  id: string,
  payload: SnapshotPayload,
): Promise<ApiResponse<void>> {
  if (await checkOnline()) {
    const res = await apiRequest<void>(`/projects/${id}/snapshot`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (res.success) return res;
    console.warn(`Online saveProjectSnapshot failed for ${id}, falling back to local storage:`, res.error);
  }

  const service = getFileStorageService();
  if (service.isEnabled()) {
    const localProjects = await readFromLocalFS('default', 'global', LOCAL_PROJECTS_KEY + '.json') as ProjectSummary[] || [];
    const idx = localProjects.findIndex(p => p.id === id);
    if (idx !== -1) {
      localProjects[idx].updated_at = new Date().toISOString();
      await writeToLocalFS('default', 'global', LOCAL_PROJECTS_KEY + '.json', localProjects);
    }

    await writeToLocalFS('default', id, `nodes_${id}.json`, payload.nodes);
    await writeToLocalFS('default', id, `connections_${id}.json`, payload.connections);
    await writeToLocalFS('default', id, `groups_${id}.json`, payload.groups);
    return { success: true };
  }

  // IndexedDB fallback: update the updated_at timestamp
  const projects = await loadFromStorage<ProjectSummary[]>(LOCAL_PROJECTS_KEY) || [];
  const idx = projects.findIndex(p => p.id === id);
  if (idx !== -1) {
    projects[idx].updated_at = new Date().toISOString();
    await saveToStorage(LOCAL_PROJECTS_KEY, projects);
  }
  return { success: true };
}
