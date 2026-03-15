import React from 'react';
import { FolderHeart, Save, LayoutTemplate } from 'lucide-react';
import type { CanvasSnapshot } from '../../types';
import { SidebarPanelShell } from './SidebarPanelShell';
import type { SidebarContextMenuState } from './types';

interface CanvasSnapshotsPanelProps {
  canvasSnapshots: CanvasSnapshot[];
  selectedCanvasSnapshotId: string | null;
  editingCanvasSnapshotId: string | null;
  onEditingCanvasSnapshotChange: (id: string | null) => void;
  onSelectCanvasSnapshot: (id: string | null) => void;
  onSaveCanvasSnapshot: () => void;
  onRenameCanvasSnapshot: (id: string, title: string) => void;
  onOpenContextMenu: (menu: SidebarContextMenuState) => void;
  onClose: () => void;
}

const getSnapshotTitle = (title: string) => title.trim() || '未命名画布快照';

export const CanvasSnapshotsPanel: React.FC<CanvasSnapshotsPanelProps> = ({
  canvasSnapshots,
  selectedCanvasSnapshotId,
  editingCanvasSnapshotId,
  onEditingCanvasSnapshotChange,
  onSelectCanvasSnapshot,
  onSaveCanvasSnapshot,
  onRenameCanvasSnapshot,
  onOpenContextMenu,
  onClose,
}) => {
  const commitRename = (id: string, title: string) => {
    onRenameCanvasSnapshot(id, getSnapshotTitle(title));
    onEditingCanvasSnapshotChange(null);
  };

  return (
    <SidebarPanelShell
      title="画布快照"
      onClose={onClose}
      bodyClassName="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-3 relative"
      action={(
        <button
          type="button"
          onClick={onSaveCanvasSnapshot}
          className="p-1.5 bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500 hover:text-white rounded-md transition-colors"
          title="保存当前画布快照"
        >
          <Save size={14} />
        </button>
      )}
    >
      {canvasSnapshots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-slate-500 opacity-60 select-none">
          <FolderHeart size={48} strokeWidth={1} className="mb-3 opacity-50" />
          <span className="text-[10px] font-medium tracking-widest uppercase text-center">
            还没有快照
            <br />
            保存当前画布以便复用
          </span>
        </div>
      ) : (
        canvasSnapshots.map((canvasSnapshot) => (
          <div
            key={canvasSnapshot.id}
            className={`
              relative p-2 rounded-xl border bg-black/20 group transition-all duration-300 cursor-grab active:cursor-grabbing hover:bg-white/5
              ${selectedCanvasSnapshotId === canvasSnapshot.id ? 'border-cyan-500/50 ring-1 ring-cyan-500/20' : 'border-white/5 hover:border-white/20'}
            `}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('application/canvas-snapshot-id', canvasSnapshot.id);
              event.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={(event) => {
              event.stopPropagation();
              onSelectCanvasSnapshot(canvasSnapshot.id);
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              onEditingCanvasSnapshotChange(canvasSnapshot.id);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenContextMenu({
                x: event.clientX,
                y: event.clientY,
                id: canvasSnapshot.id,
                type: 'snapshot',
              });
            }}
          >
            <div className="aspect-[2/1] bg-black/40 rounded-lg mb-2 overflow-hidden relative">
              {canvasSnapshot.thumbnail ? (
                <img
                  src={canvasSnapshot.thumbnail}
                  alt="画布快照缩略图"
                  loading="lazy"
                  className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-600">
                  <LayoutTemplate size={24} />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-1 gap-2">
              {editingCanvasSnapshotId === canvasSnapshot.id ? (
                <input
                  className="bg-black/50 border border-cyan-500/50 rounded px-1 text-xs text-white w-full outline-none"
                  defaultValue={canvasSnapshot.title}
                  autoFocus
                  onBlur={(event) => commitRename(canvasSnapshot.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      commitRename(canvasSnapshot.id, event.currentTarget.value);
                    }
                    if (event.key === 'Escape') {
                      onEditingCanvasSnapshotChange(null);
                    }
                  }}
                />
              ) : (
                <span className="text-xs font-medium text-slate-300 truncate select-none group-hover:text-white transition-colors">
                  {canvasSnapshot.title}
                </span>
              )}
              <span className="text-[9px] text-slate-600 font-mono shrink-0">{canvasSnapshot.nodes.length} 节点</span>
            </div>
          </div>
        ))
      )}
    </SidebarPanelShell>
  );
};
