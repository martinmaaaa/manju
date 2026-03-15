import React from 'react';
import type { NodeType } from '../../types';
import { SidebarPanelShell } from './SidebarPanelShell';
import { GENERIC_CANVAS_WORKFLOW_ITEMS } from './nodeCatalog';

interface AddNodePanelProps {
    onAddNode: (type: NodeType) => void;
    onUploadFiles?: () => void;
    onClose: () => void;
}

const SECTION_TITLES = {
    workflow: '通用工作流',
    resource: '添加资源',
} as const;

export const AddNodePanel: React.FC<AddNodePanelProps> = ({ onAddNode, onUploadFiles, onClose }) => {
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
                            const isUploadAction = !item.type;

                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                        if (item.type) {
                                            onAddNode(item.type);
                                            return;
                                        }

                                        onUploadFiles?.();
                                    }}
                                    disabled={isUploadAction && !onUploadFiles}
                                    className="w-full text-left p-3 rounded-xl bg-white/5 hover:bg-white/10 flex items-center gap-3 text-sm text-slate-200 transition-colors border border-transparent hover:border-white/5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="p-2 bg-white/10 rounded-lg text-cyan-200 shadow-inner">
                                        <ItemIcon size={16} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm">{item.title}</span>
                                            {item.beta && (
                                                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-200">
                                                    Beta
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-400">{item.description}</div>
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
