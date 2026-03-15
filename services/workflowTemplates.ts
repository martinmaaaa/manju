import { AppNode, Connection, Group, NodeStatus, NodeType } from '../types';

export type ProjectEditorMode = 'pipeline' | 'canvas';
export type PipelineTemplateId = 'short-drama-standard' | 'character-first' | 'storyboard-direct';
export type PipelineStageId = 'script' | 'character' | 'storyboard' | 'prompt' | 'video';

export interface ProjectSettings {
  editorMode?: ProjectEditorMode;
  pipelineTemplateId?: PipelineTemplateId;
}

export interface PipelineStageDefinition {
  id: PipelineStageId;
  title: string;
  summary: string;
  deliverable: string;
}

export interface PipelineTemplateDefinition {
  id: PipelineTemplateId;
  name: string;
  summary: string;
  recommendedFor: string;
  stages: PipelineStageDefinition[];
}

export interface PipelineStageStatus extends PipelineStageDefinition {
  state: 'not_started' | 'in_progress' | 'completed';
  nodeCount: number;
}

interface TemplateNodeDefinition {
  key: string;
  stage: PipelineStageId;
  type: NodeType;
  title: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  data?: Record<string, unknown>;
}

interface TemplateGraphDefinition {
  nodes: TemplateNodeDefinition[];
  connections: Array<[string, string]>;
}

const STAGE_DEFINITIONS: PipelineStageDefinition[] = [
  {
    id: 'script',
    title: '剧本',
    summary: '确定题材、世界观、角色关系与分集结构。',
    deliverable: '剧情大纲 / 分集稿',
  },
  {
    id: 'character',
    title: '人物资产',
    summary: '沉淀角色档案、参考图与统一人设。',
    deliverable: '角色卡 / 角色图',
  },
  {
    id: 'storyboard',
    title: '分镜',
    summary: '把分集稿转换为镜头列表、分镜图与可拆解镜头。',
    deliverable: '分镜图 / 拆镜结果',
  },
  {
    id: 'prompt',
    title: '提示词',
    summary: '整理视频生成用的镜头描述、动作、氛围与限制词。',
    deliverable: '终版视频提示词',
  },
  {
    id: 'video',
    title: '视频',
    summary: '提交即梦任务并回收最终视频结果。',
    deliverable: '即梦视频',
  },
];

export const DEFAULT_PIPELINE_TEMPLATE_ID: PipelineTemplateId = 'short-drama-standard';

export const DEFAULT_PROJECT_SETTINGS: Required<ProjectSettings> = {
  editorMode: 'pipeline',
  pipelineTemplateId: DEFAULT_PIPELINE_TEMPLATE_ID,
};

export const PIPELINE_TEMPLATES: PipelineTemplateDefinition[] = [
  {
    id: 'short-drama-standard',
    name: '短剧标准流',
    summary: '最适合从灵感到视频的完整链路，默认推荐。',
    recommendedFor: '先写剧本，再做人设与分镜的短剧项目',
    stages: STAGE_DEFINITIONS,
  },
  {
    id: 'character-first',
    name: '角色先行流',
    summary: '先把核心人物资产沉淀清楚，再往剧情与分镜推进。',
    recommendedFor: 'IP 人设驱动、主角稳定性要求高的项目',
    stages: STAGE_DEFINITIONS,
  },
  {
    id: 'storyboard-direct',
    name: '分镜直出流',
    summary: '弱化长剧本，直接以场景描述和人物参考进入分镜。',
    recommendedFor: '广告片、MV、概念验证和快速出样',
    stages: STAGE_DEFINITIONS,
  },
];

const TEMPLATE_GRAPHS: Record<PipelineTemplateId, TemplateGraphDefinition> = {
  'short-drama-standard': {
    nodes: [
      {
        key: 'story-seed',
        stage: 'script',
        type: NodeType.PROMPT_INPUT,
        title: '故事种子',
        x: 120,
        y: 150,
        data: {
          pipelineRole: 'story-seed',
          prompt: '',
        },
      },
      {
        key: 'script-planner',
        stage: 'script',
        type: NodeType.SCRIPT_PLANNER,
        title: '剧本大纲',
        x: 120,
        y: 410,
        data: {
          scriptEpisodes: 8,
          scriptDuration: 1,
          scriptVisualStyle: 'REAL',
        },
      },
      {
        key: 'script-episode',
        stage: 'script',
        type: NodeType.SCRIPT_EPISODE,
        title: '分集拆解',
        x: 120,
        y: 670,
        data: {
          episodeSplitCount: 3,
        },
      },
      {
        key: 'character-node',
        stage: 'character',
        type: NodeType.CHARACTER_NODE,
        title: '角色资产',
        x: 700,
        y: 410,
        data: {
          pipelineRole: 'character-assets',
        },
      },
      {
        key: 'storyboard-image',
        stage: 'storyboard',
        type: NodeType.STORYBOARD_IMAGE,
        title: '分镜图设计',
        x: 1280,
        y: 300,
        data: {
          storyboardGridType: '9',
          storyboardPanelOrientation: '16:9',
          storyboardResolution: '2k',
        },
      },
      {
        key: 'storyboard-splitter',
        stage: 'storyboard',
        type: NodeType.STORYBOARD_SPLITTER,
        title: '镜头拆解',
        x: 1280,
        y: 650,
        data: {
          pipelineRole: 'storyboard-splitter',
        },
      },
      {
        key: 'video-prompt',
        stage: 'prompt',
        type: NodeType.PROMPT_INPUT,
        title: '视频提示词',
        x: 1860,
        y: 410,
        data: {
          pipelineRole: 'video-prompt',
          prompt: '',
        },
      },
      {
        key: 'jimeng-video',
        stage: 'video',
        type: NodeType.JIMENG_VIDEO_GENERATOR,
        title: '即梦视频',
        x: 2440,
        y: 410,
        data: {
          pipelineRole: 'jimeng-video',
        },
      },
    ],
    connections: [
      ['story-seed', 'script-planner'],
      ['script-planner', 'script-episode'],
      ['script-planner', 'character-node'],
      ['script-episode', 'character-node'],
      ['script-episode', 'storyboard-image'],
      ['character-node', 'storyboard-image'],
      ['storyboard-image', 'storyboard-splitter'],
      ['video-prompt', 'jimeng-video'],
      ['storyboard-splitter', 'jimeng-video'],
    ],
  },
  'character-first': {
    nodes: [
      {
        key: 'story-seed',
        stage: 'script',
        type: NodeType.PROMPT_INPUT,
        title: '世界观 / 故事设定',
        x: 120,
        y: 150,
        data: {
          pipelineRole: 'story-seed',
          prompt: '',
        },
      },
      {
        key: 'script-planner',
        stage: 'script',
        type: NodeType.SCRIPT_PLANNER,
        title: '剧情骨架',
        x: 120,
        y: 500,
        data: {
          scriptEpisodes: 6,
          scriptDuration: 1,
          scriptVisualStyle: 'REAL',
        },
      },
      {
        key: 'character-brief',
        stage: 'character',
        type: NodeType.PROMPT_INPUT,
        title: '角色补充说明',
        x: 700,
        y: 150,
        data: {
          pipelineRole: 'character-brief',
          prompt: '',
        },
      },
      {
        key: 'character-node',
        stage: 'character',
        type: NodeType.CHARACTER_NODE,
        title: '角色资产',
        x: 700,
        y: 500,
      },
      {
        key: 'storyboard-image',
        stage: 'storyboard',
        type: NodeType.STORYBOARD_IMAGE,
        title: '分镜图设计',
        x: 1280,
        y: 300,
        data: {
          storyboardGridType: '9',
          storyboardPanelOrientation: '16:9',
          storyboardResolution: '2k',
        },
      },
      {
        key: 'storyboard-splitter',
        stage: 'storyboard',
        type: NodeType.STORYBOARD_SPLITTER,
        title: '镜头拆解',
        x: 1280,
        y: 650,
      },
      {
        key: 'video-prompt',
        stage: 'prompt',
        type: NodeType.PROMPT_INPUT,
        title: '视频提示词',
        x: 1860,
        y: 410,
        data: {
          pipelineRole: 'video-prompt',
          prompt: '',
        },
      },
      {
        key: 'jimeng-video',
        stage: 'video',
        type: NodeType.JIMENG_VIDEO_GENERATOR,
        title: '即梦视频',
        x: 2440,
        y: 410,
      },
    ],
    connections: [
      ['story-seed', 'script-planner'],
      ['story-seed', 'character-node'],
      ['character-brief', 'character-node'],
      ['script-planner', 'character-node'],
      ['story-seed', 'storyboard-image'],
      ['character-node', 'storyboard-image'],
      ['storyboard-image', 'storyboard-splitter'],
      ['video-prompt', 'jimeng-video'],
      ['storyboard-splitter', 'jimeng-video'],
    ],
  },
  'storyboard-direct': {
    nodes: [
      {
        key: 'story-seed',
        stage: 'script',
        type: NodeType.PROMPT_INPUT,
        title: '场景脚本',
        x: 120,
        y: 410,
        data: {
          pipelineRole: 'story-seed',
          prompt: '',
        },
      },
      {
        key: 'character-node',
        stage: 'character',
        type: NodeType.CHARACTER_NODE,
        title: '角色参考',
        x: 700,
        y: 410,
      },
      {
        key: 'storyboard-image',
        stage: 'storyboard',
        type: NodeType.STORYBOARD_IMAGE,
        title: '分镜图设计',
        x: 1280,
        y: 300,
        data: {
          storyboardGridType: '6',
          storyboardPanelOrientation: '16:9',
          storyboardResolution: '2k',
        },
      },
      {
        key: 'storyboard-splitter',
        stage: 'storyboard',
        type: NodeType.STORYBOARD_SPLITTER,
        title: '镜头拆解',
        x: 1280,
        y: 650,
      },
      {
        key: 'video-prompt',
        stage: 'prompt',
        type: NodeType.PROMPT_INPUT,
        title: '视频提示词',
        x: 1860,
        y: 410,
        data: {
          pipelineRole: 'video-prompt',
          prompt: '',
        },
      },
      {
        key: 'jimeng-video',
        stage: 'video',
        type: NodeType.JIMENG_VIDEO_GENERATOR,
        title: '即梦视频',
        x: 2440,
        y: 410,
      },
    ],
    connections: [
      ['story-seed', 'character-node'],
      ['story-seed', 'storyboard-image'],
      ['character-node', 'storyboard-image'],
      ['storyboard-image', 'storyboard-splitter'],
      ['video-prompt', 'jimeng-video'],
      ['storyboard-splitter', 'jimeng-video'],
    ],
  },
};

export function normalizeProjectSettings(
  settings?: Record<string, unknown> | null,
): Required<ProjectSettings> {
  const editorMode =
    settings?.editorMode === 'canvas' || settings?.editorMode === 'pipeline'
      ? settings.editorMode
      : DEFAULT_PROJECT_SETTINGS.editorMode;

  const pipelineTemplateId = PIPELINE_TEMPLATES.some(template => template.id === settings?.pipelineTemplateId)
    ? (settings?.pipelineTemplateId as PipelineTemplateId)
    : DEFAULT_PROJECT_SETTINGS.pipelineTemplateId;

  return {
    editorMode,
    pipelineTemplateId,
  };
}

export function resolveProjectEntryView(
  settings: Record<string, unknown> | null | undefined,
  hasNodes: boolean,
): ProjectEditorMode {
  if (settings?.editorMode === 'canvas' || settings?.editorMode === 'pipeline') {
    return settings.editorMode;
  }

  return hasNodes ? 'canvas' : 'pipeline';
}

export function getPipelineTemplate(templateId?: PipelineTemplateId | null): PipelineTemplateDefinition {
  return PIPELINE_TEMPLATES.find(template => template.id === templateId) || PIPELINE_TEMPLATES[0];
}

export function buildPipelineGraph(templateId: PipelineTemplateId): {
  nodes: AppNode[];
  connections: Connection[];
  groups: Group[];
} {
  const graph = TEMPLATE_GRAPHS[templateId];
  const stageMap = new Map(STAGE_DEFINITIONS.map(stage => [stage.id, stage]));
  const timestamp = Date.now();
  const nodeIdByKey = new Map<string, string>();
  let sequence = 0;

  const nodes = graph.nodes.map((definition) => {
    const id = `n-${timestamp}-${sequence++}`;
    nodeIdByKey.set(definition.key, id);

    return {
      id,
      type: definition.type,
      x: definition.x,
      y: definition.y,
      width: definition.width ?? 420,
      height: definition.height,
      title: definition.title,
      status: NodeStatus.IDLE,
      data: {
        ...definition.data,
        pipelineStage: definition.stage,
        pipelineKey: definition.key,
        pipelineTemplateId: templateId,
      },
      inputs: [],
    } satisfies AppNode;
  });

  const connections = graph.connections.map(([fromKey, toKey]) => ({
    from: nodeIdByKey.get(fromKey)!,
    to: nodeIdByKey.get(toKey)!,
  }));

  const inputsByNodeId = new Map<string, string[]>();
  for (const connection of connections) {
    const inputs = inputsByNodeId.get(connection.to) || [];
    inputs.push(connection.from);
    inputsByNodeId.set(connection.to, inputs);
  }

  const nodesWithInputs = nodes.map(node => ({
    ...node,
    inputs: inputsByNodeId.get(node.id) || [],
  }));

  const groups = Array.from(new Set(graph.nodes.map(node => node.stage))).map((stageId, index) => {
    const stageNodes = graph.nodes.filter(node => node.stage === stageId);
    const paddingX = 42;
    const paddingY = 48;
    const minX = Math.min(...stageNodes.map(node => node.x));
    const minY = Math.min(...stageNodes.map(node => node.y));
    const maxX = Math.max(...stageNodes.map(node => node.x + (node.width ?? 420)));
    const maxY = Math.max(...stageNodes.map(node => node.y + (node.height ?? 260)));
    const stage = stageMap.get(stageId)!;

    return {
      id: `g-${timestamp}-${index}`,
      title: stage.title,
      x: minX - paddingX,
      y: minY - paddingY,
      width: (maxX - minX) + paddingX * 2,
      height: (maxY - minY) + paddingY * 2,
    } satisfies Group;
  });

  return {
    nodes: nodesWithInputs,
    connections,
    groups,
  };
}

function inferStageFromNode(node: AppNode): PipelineStageId | null {
  const pipelineStage = node.data?.pipelineStage;
  if (
    pipelineStage === 'script' ||
    pipelineStage === 'character' ||
    pipelineStage === 'storyboard' ||
    pipelineStage === 'prompt' ||
    pipelineStage === 'video'
  ) {
    return pipelineStage;
  }

  switch (node.type) {
    case NodeType.SCRIPT_PLANNER:
    case NodeType.SCRIPT_EPISODE:
      return 'script';
    case NodeType.CHARACTER_NODE:
      return 'character';
    case NodeType.STORYBOARD_IMAGE:
    case NodeType.STORYBOARD_SPLITTER:
      return 'storyboard';
    case NodeType.JIMENG_VIDEO_GENERATOR:
    case NodeType.SORA_VIDEO_GENERATOR:
    case NodeType.STORYBOARD_VIDEO_GENERATOR:
      return 'video';
    case NodeType.PROMPT_INPUT:
      return node.data?.pipelineRole === 'video-prompt' ? 'prompt' : null;
    default:
      return null;
  }
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function isNodeWorking(node: AppNode): boolean {
  return node.status === NodeStatus.WORKING || node.data?.isWorking === true;
}

function isStageCompleted(stageId: PipelineStageId, nodes: AppNode[]): boolean {
  if (nodes.length === 0) return false;

  switch (stageId) {
    case 'script':
      return nodes.some(node =>
        hasText(node.data?.scriptOutline) ||
        hasItems(node.data?.generatedEpisodes) ||
        node.data?.episodeStoryboard,
      );
    case 'character':
      return nodes.some(node => hasItems(node.data?.generatedCharacters));
    case 'storyboard':
      return nodes.some(node =>
        hasItems(node.data?.storyboardGridImages) ||
        hasText(node.data?.storyboardGridImage) ||
        hasItems(node.data?.splitShots),
      );
    case 'prompt':
      return nodes.some(node => node.type === NodeType.PROMPT_INPUT && hasText(node.data?.prompt));
    case 'video':
      return nodes.some(node =>
        hasText(node.data?.videoUrl) ||
        hasText(node.data?.videoUri) ||
        hasItems(node.data?.videoUris),
      );
    default:
      return false;
  }
}

function isStageInProgress(stageId: PipelineStageId, nodes: AppNode[]): boolean {
  if (nodes.length === 0) return false;
  if (nodes.some(isNodeWorking)) return true;

  switch (stageId) {
    case 'script':
      return nodes.some(node => hasText(node.data?.prompt));
    case 'character':
      return nodes.some(node => hasItems(node.data?.extractedCharacterNames));
    case 'storyboard':
      return nodes.some(node => hasItems(node.data?.storyboardShots));
    case 'prompt':
      return nodes.some(node => hasText(node.data?.prompt));
    case 'video':
      return nodes.some(node =>
        hasText(node.data?.jimengJobId) ||
        hasText(node.data?.status) ||
        hasText(node.data?.error),
      );
    default:
      return false;
  }
}

export function getPipelineStageStatuses(
  nodes: AppNode[],
  templateId?: PipelineTemplateId | null,
): PipelineStageStatus[] {
  const template = getPipelineTemplate(templateId);

  return template.stages.map((stage) => {
    const stageNodes = nodes.filter(node => inferStageFromNode(node) === stage.id);
    const state = isStageCompleted(stage.id, stageNodes)
      ? 'completed'
      : isStageInProgress(stage.id, stageNodes)
        ? 'in_progress'
        : 'not_started';

    return {
      ...stage,
      state,
      nodeCount: stageNodes.length,
    };
  });
}

export function hasPipelineNodes(nodes: AppNode[]): boolean {
  return nodes.some(node =>
    node.data?.pipelineStage === 'script' ||
    node.data?.pipelineStage === 'character' ||
    node.data?.pipelineStage === 'storyboard' ||
    node.data?.pipelineStage === 'prompt' ||
    node.data?.pipelineStage === 'video',
  );
}
