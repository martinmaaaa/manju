import { describe, expect, it } from 'vitest';
import { NodeType } from '../../types';
import { GENERIC_CANVAS_NODE_TYPES, GENERIC_CANVAS_WORKFLOW_ITEMS } from './nodeCatalog';

describe('generic canvas workflow catalog', () => {
    it('keeps the canvas add menu focused on generic workflows', () => {
        expect(GENERIC_CANVAS_NODE_TYPES).toEqual([
            NodeType.PROMPT_INPUT,
            NodeType.IMAGE_GENERATOR,
            NodeType.VIDEO_GENERATOR,
            NodeType.AUDIO_GENERATOR,
            NodeType.IMAGE_EDITOR,
        ]);
    });

    it('exposes upload as a resource action instead of a node', () => {
        const uploadItem = GENERIC_CANVAS_WORKFLOW_ITEMS.find((item) => item.id === 'upload');

        expect(uploadItem).toBeDefined();
        expect(uploadItem?.kind).toBe('resource');
        expect(uploadItem?.type).toBeUndefined();
    });
});
