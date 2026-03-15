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
    type LucideIcon,
} from 'lucide-react';
import { NodeType } from '../../types';

export const ADDABLE_NODE_TYPES: NodeType[] = [
    NodeType.IMAGE_GENERATOR,
    NodeType.SCRIPT_PLANNER,
    NodeType.SCRIPT_EPISODE,
    NodeType.CHARACTER_NODE,
    NodeType.STYLE_PRESET,
    NodeType.STORYBOARD_GENERATOR,
    NodeType.STORYBOARD_IMAGE,
    NodeType.STORYBOARD_SPLITTER,
    NodeType.SORA_VIDEO_GENERATOR,
    NodeType.JIMENG_VIDEO_GENERATOR,
    NodeType.STORYBOARD_VIDEO_GENERATOR,
    NodeType.DRAMA_ANALYZER,
    NodeType.VIDEO_EDITOR,
];

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
