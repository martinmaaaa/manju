import React from 'react';
import { ImageIcon, Video as VideoIcon, Film } from 'lucide-react';
import { SidebarPanelShell } from './SidebarPanelShell';
import type { HistoryAssetItem, HistoryTab, SidebarContextMenuState } from './types';

interface HistoryPanelProps {
    items: HistoryAssetItem[];
    activeTab: HistoryTab;
    onTabChange: (tab: HistoryTab) => void;
    onItemClick: (item: HistoryAssetItem) => void;
    onOpenContextMenu: (menu: SidebarContextMenuState) => void;
    onClose: () => void;
}

const isImageAsset = (item: HistoryAssetItem) =>
    item.type === 'image' || item.type.includes('image') || item.type.includes('image_generator');

const isVideoAsset = (item: HistoryAssetItem) =>
    item.type === 'video' || item.type.includes('video');

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
    items,
    activeTab,
    onTabChange,
    onItemClick,
    onOpenContextMenu,
    onClose,
}) => {
    const filteredItems = items.filter((item) => (activeTab === 'image' ? isImageAsset(item) : isVideoAsset(item)));

    return (
        <SidebarPanelShell
            title="历史记录"
            onClose={onClose}
            bodyClassName="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-2 relative"
            headerContent={(
                <div className="flex bg-black/20 p-1 rounded-lg">
                    <button
                        type="button"
                        onClick={() => onTabChange('image')}
                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-[10px] font-bold rounded-md transition-all ${activeTab === 'image' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <ImageIcon size={12} /> 图片
                    </button>
                    <button
                        type="button"
                        onClick={() => onTabChange('video')}
                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-[10px] font-bold rounded-md transition-all ${activeTab === 'video' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <VideoIcon size={12} /> 视频
                    </button>
                </div>
            )}
        >
            {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-500 opacity-60 select-none">
                    {activeTab === 'image' ? (
                        <ImageIcon size={48} strokeWidth={1} className="mb-3 opacity-50" />
                    ) : (
                        <Film size={48} strokeWidth={1} className="mb-3 opacity-50" />
                    )}
                    <span className="text-[10px] font-medium tracking-widest uppercase">
                        暂无{activeTab === 'image' ? '图片' : '视频'}
                    </span>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-2 p-1">
                    {filteredItems.map((item) => (
                        <div
                            key={item.id}
                            className="aspect-square rounded-xl overflow-hidden cursor-grab active:cursor-grabbing border border-white/5 hover:border-cyan-500/50 transition-colors group relative shadow-md bg-black/20"
                            draggable
                            onDragStart={(event) => {
                                event.dataTransfer.setData('application/json', JSON.stringify(item));
                                event.dataTransfer.effectAllowed = 'copy';
                            }}
                            onClick={() => onItemClick(item)}
                            onContextMenu={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onOpenContextMenu({
                                    x: event.clientX,
                                    y: event.clientY,
                                    id: item.id,
                                    type: 'history',
                                });
                            }}
                        >
                            {isImageAsset(item) ? (
                                <img
                                    src={item.src}
                                    alt="素材缩略图"
                                    loading="lazy"
                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                    draggable={false}
                                />
                            ) : (
                                <video
                                    src={item.src}
                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                    draggable={false}
                                />
                            )}
                            <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[8px] font-bold text-white/70">
                                {isImageAsset(item) ? 'IMG' : 'MOV'}
                            </div>
                            <div className="absolute bottom-0 left-0 w-full p-1.5 bg-gradient-to-t from-black/80 to-transparent text-[9px] text-white/90 truncate font-medium">
                                {item.title || 'Untitled'}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </SidebarPanelShell>
    );
};
