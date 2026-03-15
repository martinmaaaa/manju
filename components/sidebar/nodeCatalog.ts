import {
    Plus,
    ImageIcon,
    Film,
    Mic2,
    ScanFace,
    Brush,
    Type,
    BookOpen,
    ScrollText,
    Clapperboard,
    LayoutGrid,
    Grid,
    Wand2,
    User,
    Search,
    Sparkles,
    Palette,
    Upload,
    type LucideIcon,
} from 'lucide-react';
import { NodeType } from '../../types';

export type CanvasWorkflowMenuKind = 'workflow' | 'resource';

export interface CanvasWorkflowMenuItem {
    id: string;
    title: string;
    description: string;
    kind: CanvasWorkflowMenuKind;
    icon: LucideIcon;
    type?: NodeType;
    beta?: boolean;
}

export const GENERIC_CANVAS_WORKFLOW_ITEMS: CanvasWorkflowMenuItem[] = [
    {
        id: 'text',
        title: '文本',
        description: '脚本、广告词、品牌文案',
        kind: 'workflow',
        icon: Type,
        type: NodeType.PROMPT_INPUT,
    },
    {
        id: 'image',
        title: '图片',
        description: '创意图、参考图、氛围图',
        kind: 'workflow',
        icon: ImageIcon,
        type: NodeType.IMAGE_GENERATOR,
    },
    {
        id: 'video',
        title: '视频',
        description: '通用视频生成与素材拼接',
        kind: 'workflow',
        icon: Film,
        type: NodeType.VIDEO_GENERATOR,
    },
    {
        id: 'audio',
        title: '音频',
        description: '配乐、音效、语音草稿',
        kind: 'workflow',
        icon: Mic2,
        type: NodeType.AUDIO_GENERATOR,
        beta: true,
    },
    {
        id: 'image-editor',
        title: '图片编辑器',
        description: '裁切、修图、重绘与二次加工',
        kind: 'workflow',
        icon: Brush,
        type: NodeType.IMAGE_EDITOR,
    },
    {
        id: 'upload',
        title: '上传',
        description: '导入本地图片或视频素材',
        kind: 'resource',
        icon: Upload,
    },
];

export const GENERIC_CANVAS_NODE_TYPES: NodeType[] = GENERIC_CANVAS_WORKFLOW_ITEMS
    .filter((item): item is CanvasWorkflowMenuItem & { type: NodeType } => Boolean(item.type))
    .map((item) => item.type);

export const getNodeIcon = (type: string): LucideIcon => {
    switch (type) {
        case NodeType.PROMPT_INPUT:
            return Type;
        case NodeType.IMAGE_GENERATOR:
            return ImageIcon;
        case NodeType.VIDEO_GENERATOR:
            return Film;
        case NodeType.AUDIO_GENERATOR:
            return Mic2;
        case NodeType.VIDEO_ANALYZER:
            return ScanFace;
        case NodeType.IMAGE_EDITOR:
            return Brush;
        case NodeType.SCRIPT_PLANNER:
            return BookOpen;
        case NodeType.SCRIPT_EPISODE:
            return ScrollText;
        case NodeType.STORYBOARD_GENERATOR:
            return Clapperboard;
        case NodeType.STORYBOARD_IMAGE:
            return LayoutGrid;
        case NodeType.STORYBOARD_SPLITTER:
            return Grid;
        case NodeType.SORA_VIDEO_GENERATOR:
            return Wand2;
        case NodeType.STORYBOARD_VIDEO_GENERATOR:
            return Film;
        case NodeType.CHARACTER_NODE:
            return User;
        case NodeType.DRAMA_ANALYZER:
            return Search;
        case NodeType.DRAMA_REFINED:
            return Sparkles;
        case NodeType.STYLE_PRESET:
            return Palette;
        case NodeType.VIDEO_EDITOR:
            return Film;
        case NodeType.JIMENG_VIDEO_GENERATOR:
            return Wand2;
        default:
            return Plus;
    }
};
