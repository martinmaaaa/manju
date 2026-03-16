import React, { useEffect, useRef, useState } from 'react';
import { Plus, RotateCcw, History, FolderHeart, Edit, Trash2, Settings } from 'lucide-react';
import type { PipelineTemplateId } from '../services/workflowTemplates';
import { CanvasSnapshot, NodeType } from '../types';
import { AddNodePanel } from './sidebar/AddNodePanel';
import { HistoryPanel } from './sidebar/HistoryPanel';
import { CanvasSnapshotsPanel } from './sidebar/CanvasSnapshotsPanel';
import type { HistoryAssetItem, PanelId, SidebarContextMenuState } from './sidebar/types';

interface SidebarDockProps {
    onAddNode: (type: NodeType) => void;
    onAddWorkflowTemplate?: (templateId: PipelineTemplateId) => void;
    onUploadFiles?: () => void;
    onUndo: () => void;
    isChatOpen: boolean;
    onToggleChat: () => void;
    isMultiFrameOpen: boolean;
    onToggleMultiFrame: () => void;
    isSonicStudioOpen?: boolean;
    onToggleSonicStudio?: () => void;
    isCharacterLibraryOpen?: boolean;
    onToggleCharacterLibrary?: () => void;
    isDebugOpen?: boolean;
    onToggleDebug?: () => void;
    assetHistory: HistoryAssetItem[];
    onHistoryItemClick: (item: HistoryAssetItem) => void;
    onDeleteAsset: (id: string) => void;
    canvasSnapshots: CanvasSnapshot[];
    selectedCanvasSnapshotId: string | null;
    onSelectCanvasSnapshot: (id: string | null) => void;
    onSaveCanvasSnapshot: () => void;
    onDeleteCanvasSnapshot: (id: string) => void;
    onRenameCanvasSnapshot: (id: string, title: string) => void;
    onOpenSettings: () => void;
}

const SPRING = 'cubic-bezier(0.32, 0.72, 0, 1)';
const PANEL_IDS: PanelId[] = ['add', 'history', 'snapshot'];

const isPanelId = (id: string): id is PanelId => PANEL_IDS.includes(id as PanelId);

export const SidebarDock: React.FC<SidebarDockProps> = ({
    onAddNode,
    onAddWorkflowTemplate,
    onUploadFiles,
    onUndo,
    assetHistory,
    onHistoryItemClick,
    onDeleteAsset,
    canvasSnapshots,
    selectedCanvasSnapshotId,
    onSelectCanvasSnapshot,
    onSaveCanvasSnapshot,
    onDeleteCanvasSnapshot,
    onRenameCanvasSnapshot,
    onOpenSettings,
}) => {
    const [activePanel, setActivePanel] = useState<PanelId | null>(null);
    const [pinnedPanel, setPinnedPanel] = useState<PanelId | null>(null);
    const [activeHistoryTab, setActiveHistoryTab] = useState<'image' | 'video'>('image');
    const [editingCanvasSnapshotId, setEditingCanvasSnapshotId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<SidebarContextMenuState | null>(null);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const visiblePanel = pinnedPanel ?? activePanel;

    const clearCloseTimeout = () => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
        }
    };

    const closePanel = () => {
        clearCloseTimeout();
        setActivePanel(null);
        setPinnedPanel(null);
    };

    const handleSidebarHover = (id: string) => {
        if (pinnedPanel) return;

        if (isPanelId(id)) {
            clearCloseTimeout();
            setActivePanel(id);
            return;
        }

        closeTimeoutRef.current = setTimeout(() => setActivePanel(null), 100);
    };

    const handleSidebarLeave = () => {
        if (pinnedPanel) return;
        clearCloseTimeout();
        closeTimeoutRef.current = setTimeout(() => setActivePanel(null), 500);
    };

    const handlePanelEnter = () => {
        clearCloseTimeout();
    };

    const handlePanelLeave = () => {
        if (pinnedPanel) return;
        clearCloseTimeout();
        closeTimeoutRef.current = setTimeout(() => setActivePanel(null), 500);
    };

    const togglePinnedPanel = (panel: PanelId) => {
        clearCloseTimeout();
        const nextPinnedPanel = pinnedPanel === panel ? null : panel;
        setPinnedPanel(nextPinnedPanel);
        setActivePanel(nextPinnedPanel);
    };

    const handleAddNodeFromPanel = (type: NodeType) => {
        onAddNode(type);
        if (!pinnedPanel) {
            setActivePanel(null);
        }
    };

    const handleAddWorkflowTemplateFromPanel = (templateId: PipelineTemplateId) => {
        onAddWorkflowTemplate?.(templateId);
        if (!pinnedPanel) {
            setActivePanel(null);
        }
    };

    const handleUploadFromPanel = () => {
        onUploadFiles?.();
        if (!pinnedPanel) {
            setActivePanel(null);
        }
    };

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    useEffect(() => () => clearCloseTimeout(), []);

    const renderPanelContent = () => {
        if (visiblePanel === 'history') {
            return (
                <HistoryPanel
                    items={assetHistory}
                    activeTab={activeHistoryTab}
                    onTabChange={setActiveHistoryTab}
                    onItemClick={onHistoryItemClick}
                    onOpenContextMenu={setContextMenu}
                    onClose={closePanel}
                />
            );
        }

        if (visiblePanel === 'snapshot') {
            return (
                <CanvasSnapshotsPanel
                    canvasSnapshots={canvasSnapshots}
                    selectedCanvasSnapshotId={selectedCanvasSnapshotId}
                    editingCanvasSnapshotId={editingCanvasSnapshotId}
                    onEditingCanvasSnapshotChange={setEditingCanvasSnapshotId}
                    onSelectCanvasSnapshot={onSelectCanvasSnapshot}
                    onSaveCanvasSnapshot={onSaveCanvasSnapshot}
                    onRenameCanvasSnapshot={onRenameCanvasSnapshot}
                    onOpenContextMenu={setContextMenu}
                    onClose={closePanel}
                />
            );
        }

        return (
            <AddNodePanel
                onAddNode={handleAddNodeFromPanel}
                onAddWorkflowTemplate={handleAddWorkflowTemplateFromPanel}
                onUploadFiles={handleUploadFromPanel}
                onClose={closePanel}
            />
        );
    };

    return (
        <>
            <div
                className="fixed left-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-3 p-2 bg-gradient-to-br from-white/10 via-white/5 to-white/10 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_8px_32px_0_rgba(0,0,0,0.37)] z-50 animate-in slide-in-from-left-10 duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden"
                onMouseLeave={handleSidebarLeave}
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />
                {[
                    { id: 'snapshot', icon: FolderHeart },
                    { id: 'add', icon: Plus },
                    { id: 'history', icon: History },
                    { id: 'undo', icon: RotateCcw, action: onUndo },
                ].map((item) => (
                    <div key={item.id} className="relative group">
                        <button
                            type="button"
                            onMouseEnter={() => handleSidebarHover(item.id)}
                            onClick={() => item.action ? item.action() : isPanelId(item.id) && togglePinnedPanel(item.id)}
                            className={`relative group w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 ${visiblePanel === item.id ? 'bg-white text-black shadow-lg' : 'hover:bg-white/10 text-slate-300 hover:text-white'}`}
                        >
                            <item.icon size={20} strokeWidth={2} />
                            {pinnedPanel === item.id && (
                                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_0_2px_rgba(15,23,42,0.85)]" />
                            )}
                        </button>
                    </div>
                ))}

                <div className="w-8 h-px bg-white/10 my-1" />

                <button
                    type="button"
                    onClick={onOpenSettings}
                    className="relative group w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 hover:bg-white/10 text-slate-300 hover:text-white"
                >
                    <Settings size={20} strokeWidth={2} />
                </button>
            </div>

            <div
                className={`fixed left-24 top-1/2 -translate-y-1/2 max-h-[75vh] h-auto w-72 bg-gradient-to-br from-white/10 via-white/5 to-white/10 backdrop-blur-3xl border border-white/20 rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_8px_32px_0_rgba(0,0,0,0.37)] transition-all duration-500 ease-[${SPRING}] z-[60] flex flex-col overflow-hidden ${visiblePanel ? 'translate-x-0 opacity-100' : '-translate-x-10 opacity-0 pointer-events-none scale-95'}`}
                onMouseEnter={handlePanelEnter}
                onMouseLeave={handlePanelLeave}
                onMouseDown={(event) => event.stopPropagation()}
                onWheel={(event) => event.stopPropagation()}
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />
                {visiblePanel && renderPanelContent()}
            </div>

            {contextMenu && (
                <div
                    className="fixed z-[100] bg-[#2c2c2e] border border-white/10 rounded-lg shadow-2xl p-1 animate-in fade-in zoom-in-95 duration-200 min-w-[120px]"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onMouseLeave={() => setContextMenu(null)}
                >
                    {contextMenu.type === 'history' && (
                        <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/20 rounded-md flex items-center gap-2"
                            onClick={() => {
                                onDeleteAsset(contextMenu.id);
                                setContextMenu(null);
                            }}
                        >
                            <Trash2 size={12} /> 删除
                        </button>
                    )}
                    {contextMenu.type === 'snapshot' && (
                        <>
                            <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-white/10 rounded-md flex items-center gap-2"
                                onClick={() => {
                                    setEditingCanvasSnapshotId(contextMenu.id);
                                    setContextMenu(null);
                                }}
                            >
                                <Edit size={12} /> 重命名
                            </button>
                            <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/20 rounded-md flex items-center gap-2"
                                onClick={() => {
                                    onDeleteCanvasSnapshot(contextMenu.id);
                                    setContextMenu(null);
                                }}
                            >
                                <Trash2 size={12} /> 删除
                            </button>
                        </>
                    )}
                </div>
            )}
        </>
    );
};
