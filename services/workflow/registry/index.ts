import type { WorkflowTemplateDefinition, WorkflowTemplateId } from '../domain/types';

const manjuSeriesStages = [
  {
    id: 'series-bible',
    title: '系列设定',
    summary: '定义世界观、风格、人物关系与整体基调。',
    kind: 'form',
    dependsOn: [],
  },
  {
    id: 'character-assets',
    title: '人物资产',
    summary: '沉淀人物设定、立绘、表情与版本。',
    kind: 'asset',
    dependsOn: ['series-bible'],
    assetRequirements: ['character', 'style'],
  },
  {
    id: 'scene-assets',
    title: '场景资产',
    summary: '沉淀主场景、空间关系与时间版本。',
    kind: 'asset',
    dependsOn: ['series-bible'],
    assetRequirements: ['scene', 'style'],
  },
  {
    id: 'prop-assets',
    title: '道具资产',
    summary: '沉淀可复用道具与连续性规则。',
    kind: 'asset',
    dependsOn: ['series-bible'],
    assetRequirements: ['prop'],
  },
  {
    id: 'episode-plan',
    title: '分集规划',
    summary: '规划总集数、分集主题与主线节奏。',
    kind: 'planner',
    dependsOn: ['character-assets', 'scene-assets'],
  },
] satisfies WorkflowTemplateDefinition['stages'];

const manjuEpisodeStages = [
  {
    id: 'episode-script',
    title: '剧本',
    summary: '编写本集剧情、冲突、出场角色与核心事件。',
    kind: 'form',
    dependsOn: [],
  },
  {
    id: 'episode-assets',
    title: '资产绑定',
    summary: '为本集绑定人物、场景、道具与风格版本。',
    kind: 'binding',
    dependsOn: ['episode-script'],
    assetRequirements: ['character', 'scene', 'prop', 'style'],
  },
  {
    id: 'storyboard',
    title: '分镜',
    summary: '根据本集剧本和资产产出镜头结构。',
    kind: 'storyboard',
    dependsOn: ['episode-assets'],
  },
  {
    id: 'prompt',
    title: '提示词',
    summary: '整合镜头描述、角色资产与风格规则。',
    kind: 'prompt',
    dependsOn: ['storyboard'],
  },
  {
    id: 'video',
    title: '视频',
    summary: '提交生成任务、轮询状态并回收结果。',
    kind: 'video',
    dependsOn: ['prompt'],
  },
] satisfies WorkflowTemplateDefinition['stages'];

export const WORKFLOW_TEMPLATES: WorkflowTemplateDefinition[] = [
  {
    id: 'manju-series',
    name: '漫剧工作流',
    scope: 'series',
    summary: '面向长篇漫剧的系列级生产中心，先沉淀资产，再推进分集制作。',
    recommendedFor: '适合 20~80 集以上、需要人物/场景/道具长期复用的漫剧项目。',
    stages: manjuSeriesStages,
    childTemplateId: 'manju-episode',
    defaultEpisodeCount: 80,
  },
  {
    id: 'manju-episode',
    name: '漫剧单集工作流',
    scope: 'episode',
    summary: '围绕单集从剧本到视频的执行工作流。',
    recommendedFor: '适合作为漫剧系列中的单集生产单元。',
    stages: manjuEpisodeStages,
    canvasMaterializationTemplateId: 'short-drama-standard',
  },
];

export function getWorkflowTemplate(templateId: WorkflowTemplateId): WorkflowTemplateDefinition {
  return WORKFLOW_TEMPLATES.find(template => template.id === templateId) ?? WORKFLOW_TEMPLATES[0];
}
