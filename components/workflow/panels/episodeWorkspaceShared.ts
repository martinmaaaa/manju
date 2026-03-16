import type React from 'react';
import {
  CheckCircle2,
  Film,
  FolderHeart,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type {
  WorkflowAsset,
  WorkflowBindingMode,
  WorkflowStageStatus,
} from '../../../services/workflow/domain/types';

export type EditableBindingMode = Extract<WorkflowBindingMode, 'follow_latest' | 'pinned'>;

export const episodeStageIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'episode-script': Sparkles,
  'episode-assets': FolderHeart,
  storyboard: Film,
  prompt: Wand2,
  video: CheckCircle2,
};

export const stageStatusOptions: WorkflowStageStatus[] = [
  'not_started',
  'in_progress',
  'completed',
  'error',
];

export const stageStatusLabels: Record<WorkflowStageStatus, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  completed: '已完成',
  error: '异常',
};

export const stageStatusClassNames: Record<WorkflowStageStatus, string> = {
  not_started: '',
  in_progress: 'is-accent',
  completed: 'is-success',
  error: 'is-danger',
};

export const episodeBindingModeOptions: Array<{
  value: EditableBindingMode;
  label: string;
  hint: string;
}> = [
  {
    value: 'follow_latest',
    label: '跟随最新',
    hint: '资产有新版本时，本集会自动跟到最新版本。',
  },
  {
    value: 'pinned',
    label: '固定版本',
    hint: '锁定当前版本，后续资产更新不会自动变化。',
  },
];

export const episodeBindingModeLabels: Record<WorkflowBindingMode, string> = {
  follow_latest: '跟随最新',
  pinned: '固定版本',
  derived: '派生版本',
};

export const episodeAssetTypeLabels: Record<WorkflowAsset['type'], string> = {
  character: '人物',
  scene: '场景',
  prop: '道具',
  style: '风格',
};

export function normalizeEditableBindingMode(mode?: WorkflowBindingMode): EditableBindingMode {
  return mode === 'pinned' ? 'pinned' : 'follow_latest';
}
