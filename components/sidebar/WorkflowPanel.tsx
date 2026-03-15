import React from 'react';
import { FolderHeart, Save, Workflow as WorkflowIcon } from 'lucide-react';
import type { Workflow } from '../../types';
import { SidebarPanelShell } from './SidebarPanelShell';
import type { SidebarContextMenuState } from './types';

interface WorkflowPanelProps {
    workflows: Workflow[];
    selectedWorkflowId: string | null;
    editingWorkflowId: string | null;
    onEditingWorkflowChange: (id: string | null) => void;
    onSelectWorkflow: (id: string | null) => void;
    onSaveWorkflow: () => void;
    onRenameWorkflow: (id: string, title: string) => void;
    onOpenContextMenu: (menu: SidebarContextMenuState) => void;
    onClose: () => void;
}

const getWorkflowTitle = (title: string) => title.trim() || '未命名工作流';

export const WorkflowPanel: React.FC<WorkflowPanelProps> = ({
    workflows,
    selectedWorkflowId,
    editingWorkflowId,
    onEditingWorkflowChange,
    onSelectWorkflow,
    onSaveWorkflow,
    onRenameWorkflow,
    onOpenContextMenu,
    onClose,
}) => {
    const commitRename = (id: string, title: string) => {
        onRenameWorkflow(id, getWorkflowTitle(title));
        onEditingWorkflowChange(null);
    };

    return (
        <SidebarPanelShell
            title="我的工作流"
            onClose={onClose}
            bodyClassName="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-3 relative"
            action={(
                <button
                    type="button"
                    onClick={onSaveWorkflow}
                    className="p-1.5 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500 hover:text-white rounded-md transition-colors"
                    title="保存当前工作流"
                >
                    <Save size={14} />
                </button>
            )}
        >
            {workflows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-500 opacity-60 select-none">
                    <FolderHeart size={48} strokeWidth={1} className="mb-3 opacity-50" />
                    <span className="text-[10px] font-medium tracking-widest uppercase text-center">
                        空空如也
                        <br />
                        保存您的第一个工作流
                    </span>
                </div>
            ) : (
                workflows.map((workflow) => (
                    <div
                        key={workflow.id}
                        className={`
                            relative p-2 rounded-xl border bg-black/20 group transition-all duration-300 cursor-grab active:cursor-grabbing hover:bg-white/5
                            ${selectedWorkflowId === workflow.id ? 'border-cyan-500/50 ring-1 ring-cyan-500/20' : 'border-white/5 hover:border-white/20'}
                        `}
                        draggable
                        onDragStart={(event) => {
                            event.dataTransfer.setData('application/workflow-id', workflow.id);
                            event.dataTransfer.effectAllowed = 'copy';
                        }}
                        onClick={(event) => {
                            event.stopPropagation();
                            onSelectWorkflow(workflow.id);
                        }}
                        onDoubleClick={(event) => {
                            event.stopPropagation();
                            onEditingWorkflowChange(workflow.id);
                        }}
                        onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onOpenContextMenu({
                                x: event.clientX,
                                y: event.clientY,
                                id: workflow.id,
                                type: 'workflow',
                            });
                        }}
                    >
                        <div className="aspect-[2/1] bg-black/40 rounded-lg mb-2 overflow-hidden relative">
                            {workflow.thumbnail ? (
                                <img
                                    src={workflow.thumbnail}
                                    alt="工作流缩略图"
                                    loading="lazy"
                                    className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                                    draggable={false}
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-600">
                                    <WorkflowIcon size={24} />
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-between px-1 gap-2">
                            {editingWorkflowId === workflow.id ? (
                                <input
                                    className="bg-black/50 border border-cyan-500/50 rounded px-1 text-xs text-white w-full outline-none"
                                    defaultValue={workflow.title}
                                    autoFocus
                                    onBlur={(event) => commitRename(workflow.id, event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            commitRename(workflow.id, event.currentTarget.value);
                                        }
                                        if (event.key === 'Escape') {
                                            onEditingWorkflowChange(null);
                                        }
                                    }}
                                />
                            ) : (
                                <span className="text-xs font-medium text-slate-300 truncate select-none group-hover:text-white transition-colors">
                                    {workflow.title}
                                </span>
                            )}
                            <span className="text-[9px] text-slate-600 font-mono shrink-0">{workflow.nodes.length} 节点</span>
                        </div>
                    </div>
                ))
            )}
        </SidebarPanelShell>
    );
};
