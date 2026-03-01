import { create } from 'zustand';
import { enablePatches, produceWithPatches, applyPatches, Patch } from 'immer';
import { AppNode, Connection, Group } from '../types';

enablePatches();

interface HistoryStateSnapshot {
    nodes: AppNode[];
    connections: Connection[];
    groups: Group[];
}

interface HistoryEntry {
    patches: Patch[];
    inversePatches: Patch[];
}

interface HistoryState {
    undoStack: HistoryEntry[];
    redoStack: HistoryEntry[];
    currentSnapshot: HistoryStateSnapshot | null;
    isUndoRedo: boolean;
    maxHistorySize: number;

    canUndo: boolean;
    canRedo: boolean;

    saveToHistory: (nodes: AppNode[], connections: Connection[], groups: Group[]) => void;
    undo: () => HistoryStateSnapshot | null;
    redo: () => HistoryStateSnapshot | null;
    clearHistory: () => void;
    getCurrentState: () => HistoryStateSnapshot | null;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
    undoStack: [],
    redoStack: [],
    currentSnapshot: null,
    isUndoRedo: false,
    maxHistorySize: 50,

    canUndo: false,
    canRedo: false,

    saveToHistory: (nodes, connections, groups) => {
        const { currentSnapshot, isUndoRedo, undoStack, maxHistorySize } = get();
        const newState: HistoryStateSnapshot = { nodes, connections, groups };

        if (!currentSnapshot) {
            set({ currentSnapshot: newState });
            return;
        }

        if (isUndoRedo) {
            return;
        }

        try {
            const [, patches, inversePatches] = produceWithPatches(currentSnapshot, (draft) => {
                draft.nodes = newState.nodes as any;
                draft.connections = newState.connections as any;
                draft.groups = newState.groups as any;
            });

            if (patches.length > 0) {
                let newUndoStack = [...undoStack, { patches, inversePatches }];
                if (newUndoStack.length > maxHistorySize) {
                    newUndoStack = newUndoStack.slice(newUndoStack.length - maxHistorySize);
                }

                set({
                    undoStack: newUndoStack,
                    redoStack: [],
                    currentSnapshot: newState,
                    canUndo: true,
                    canRedo: false
                });
            }
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('History patch computation failed:', error);
            }
            set({ currentSnapshot: newState });
        }
    },

    undo: () => {
        const { undoStack, currentSnapshot, redoStack } = get();
        if (undoStack.length === 0 || !currentSnapshot) return null;

        set({ isUndoRedo: true });

        const entry = undoStack[undoStack.length - 1];
        const newUndoStack = undoStack.slice(0, -1);

        try {
            const restored = applyPatches(currentSnapshot, entry.inversePatches) as HistoryStateSnapshot;
            const newRedoStack = [...redoStack, entry];

            set({
                undoStack: newUndoStack,
                redoStack: newRedoStack,
                currentSnapshot: restored,
                canUndo: newUndoStack.length > 0,
                canRedo: true,
                isUndoRedo: false
            });

            return restored;
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('History undo failed:', error);
            }
            set({ isUndoRedo: false });
            return null;
        }
    },

    redo: () => {
        const { redoStack, currentSnapshot, undoStack } = get();
        if (redoStack.length === 0 || !currentSnapshot) return null;

        set({ isUndoRedo: true });

        const entry = redoStack[redoStack.length - 1];
        const newRedoStack = redoStack.slice(0, -1);

        try {
            const restored = applyPatches(currentSnapshot, entry.patches) as HistoryStateSnapshot;
            const newUndoStack = [...undoStack, entry];

            set({
                redoStack: newRedoStack,
                undoStack: newUndoStack,
                currentSnapshot: restored,
                canUndo: true,
                canRedo: newRedoStack.length > 0,
                isUndoRedo: false
            });

            return restored;
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('History redo failed:', error);
            }
            set({ isUndoRedo: false });
            return null;
        }
    },

    clearHistory: () => set({
        undoStack: [],
        redoStack: [],
        currentSnapshot: null,
        canUndo: false,
        canRedo: false
    }),

    getCurrentState: () => get().currentSnapshot
}));
