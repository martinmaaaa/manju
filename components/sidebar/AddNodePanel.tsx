import React from 'react';
import type { PipelineTemplateId } from '../../services/workflowTemplates';
import type { NodeType } from '../../types';
import { SidebarPanelShell } from './SidebarPanelShell';
import { GENERIC_CANVAS_WORKFLOW_ITEMS } from './nodeCatalog';

interface AddNodePanelProps {
  onAddNode: (type: NodeType) => void;
  onAddWorkflowTemplate?: (templateId: PipelineTemplateId) => void;
  onUploadFiles?: () => void;
  onClose: () => void;
}

const SECTION_TITLES = {
  workflow: '通用工作流',
  resource: '添加资源',
} as const;

export const AddNodePanel: React.FC<AddNodePanelProps> = ({
  onAddNode,
  onAddWorkflowTemplate,
  onUploadFiles,
  onClose,
}) => {
  return (
    <SidebarPanelShell title="添加工作流" onClose={onClose}>
      {(['workflow', 'resource'] as const).map((section) => {
        const items = GENERIC_CANVAS_WORKFLOW_ITEMS.filter((item) => item.kind === section);

        return (
          <div key={section} className="space-y-2">
            <div className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              {SECTION_TITLES[section]}
            </div>

            {items.map((item) => {
              const ItemIcon = item.icon;
              const isUploadAction = !item.type && !item.workflowTemplateId;
              const isWorkflowTemplate = Boolean(item.workflowTemplateId);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.workflowTemplateId) {
                      onAddWorkflowTemplate?.(item.workflowTemplateId);
                      return;
                    }

                    if (item.type) {
                      onAddNode(item.type);
                      return;
                    }

                    onUploadFiles?.();
                  }}
                  disabled={(isUploadAction && !onUploadFiles) || (isWorkflowTemplate && !onAddWorkflowTemplate)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    item.featured
                      ? 'border-cyan-500/20 bg-cyan-500/10 hover:bg-cyan-500/15'
                      : 'border-transparent bg-white/5 hover:border-white/5 hover:bg-white/10 hover:shadow-lg'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <div className="flex items-center gap-3 text-sm text-slate-200">
                    <div className={`rounded-lg p-2 shadow-inner ${item.featured ? 'bg-cyan-500/15 text-cyan-100' : 'bg-white/10 text-cyan-200'}`}>
                      <ItemIcon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{item.title}</span>
                        {item.featured && (
                          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-200">
                            整套
                          </span>
                        )}
                        {item.beta && (
                          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-200">
                            Beta
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">{item.description}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </SidebarPanelShell>
  );
};
