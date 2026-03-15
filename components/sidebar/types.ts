export type PanelId = 'history' | 'workflow' | 'add';

export type HistoryTab = 'image' | 'video';

export interface HistoryAssetItem {
    id: string;
    type: string;
    src: string;
    title?: string;
    timestamp?: number;
    data?: unknown;
}

export interface SidebarContextMenuState {
    x: number;
    y: number;
    id: string;
    type: 'workflow' | 'history';
}
