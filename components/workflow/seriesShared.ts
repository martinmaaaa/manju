import type { WorkflowBindingMode } from '../../services/workflow/domain/types';

export type PreferredBindingMode = Extract<WorkflowBindingMode, 'follow_latest' | 'pinned'>;

export const bindingModeLabels: Record<PreferredBindingMode, string> = {
  follow_latest: '跟随最新',
  pinned: '固定版本',
};

export function toPreferredBindingMode(mode?: WorkflowBindingMode): PreferredBindingMode {
  return mode === 'pinned' ? 'pinned' : 'follow_latest';
}
