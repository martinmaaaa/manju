import React, { memo } from 'react';
import { useEditorStore } from '../stores/editor.store';
import { useCanvasStore } from '../stores/canvasStore';
import { AppNode } from '../types';
import { Node } from './Node';
import { useViewportCulling } from '../hooks/useViewportCulling';
import { useWindowSize } from '../hooks/useWindowSize';

interface NodeLayerProps {
    onNodeMouseDown: (e: React.MouseEvent, id: string) => void;
    onNodeContextMenu: (e: React.MouseEvent, id: string) => void;
    onPortMouseDown: (e: React.MouseEvent, id: string, type: 'input' | 'output') => void;
    onPortMouseUp: (e: React.MouseEvent, id: string, type: 'input' | 'output') => void;
    onNodeDelete: (id: string) => void;
    onNodeUpdate: (id: string, data: any, size?: any, title?: string) => void;
    onNodeAction: (id: string, action: string, payload?: any) => void;
    onNodeExpand: (data: any) => void;
    onNodeCrop: (id: string, img: string) => void;
    onCharacterAction: (nodeId: string, action: 'DELETE' | 'SAVE' | 'RETRY' | 'GENERATE_EXPRESSION' | 'GENERATE_THREE_VIEW' | 'GENERATE_SINGLE', charName: string) => void;
    onOpenVideoEditor: (nodeId: string) => void;
    onInputReorder: (nodeId: string, newOrder: string[]) => void;
    onViewCharacter: (character: any) => void;
    getConnectionLayer: () => React.ReactNode;
}

export const NodeLayer = memo(({
    onNodeMouseDown,
    onNodeContextMenu,
    onPortMouseDown,
    onPortMouseUp,
    onNodeDelete,
    onNodeUpdate,
    onNodeAction,
    onNodeExpand,
    onNodeCrop,
    onCharacterAction,
    onOpenVideoEditor,
    onInputReorder,
    onViewCharacter,
    getConnectionLayer
}: NodeLayerProps) => {
    const { nodes, selectedNodeIds, activeGroupNodeIds, draggingNodeId } = useEditorStore();
    const { pan, scale } = useCanvasStore();
    const windowSize = useWindowSize();

    const visibleNodes = useViewportCulling(
        nodes,
        pan,
        scale,
        windowSize.width,
        windowSize.height
    );

    return (
        <>
            <div
                className="absolute inset-0 pointer-events-none"
                style={{ zIndex: 0 }}
            >
                {getConnectionLayer()}
            </div>

            <div style={{ zIndex: 10 }}>
                {visibleNodes.map((node) => (
                    <Node
                        key={node.id}
                        node={node}
                        isSelected={selectedNodeIds.includes(node.id)}
                        isActiveInGroup={activeGroupNodeIds.includes(node.id)}
                        isDragging={node.id === draggingNodeId}
                        onNodeMouseDown={(e) => onNodeMouseDown(e, node.id)}
                        onNodeContextMenu={(e) => onNodeContextMenu(e, node.id)}
                        onPortMouseDown={(e, type) => onPortMouseDown(e as any, node.id, type as 'input' | 'output')}
                        onPortMouseUp={(e, type) => onPortMouseUp(e as any, node.id, type as 'input' | 'output')}
                        onResizeMouseDown={(e, w, h) => {
                            if (w !== undefined && h !== undefined) {
                                // Default handled outside or cast via node sizes
                            }
                        }}
                        onDelete={() => onNodeDelete(node.id)}
                        onUpdate={(data, size, title) => onNodeUpdate(node.id, data, title)}
                        onAction={(action, payload) => onNodeAction(node.id, action as string, payload)}
                        onResize={(e, params) => {
                            if (params && params.width && params.height) {
                                // optional handling
                            }
                        }}
                        onExpand={onNodeExpand}
                        onCrop={(img) => onNodeCrop(node.id, img)}
                        onCharacterAction={(action, charName) => onCharacterAction(node.id, action as any, charName)}
                        onOpenVideoEditor={() => onOpenVideoEditor(node.id)}
                        onInputReorder={(newOrder) => onInputReorder(node.id, newOrder as unknown as string[])}
                        onViewCharacter={onViewCharacter}
                    />
                ))}
            </div>
        </>
    );
});
