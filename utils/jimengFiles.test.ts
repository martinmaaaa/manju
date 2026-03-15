import { describe, expect, it } from 'vitest';
import {
    JIMENG_MAX_REFERENCE_IMAGES,
    getJimengReferenceValidationMessage,
    validateJimengReferenceFiles,
} from './jimengFiles';

describe('validateJimengReferenceFiles', () => {
    it('keeps only unique image files', () => {
        const duplicate = new File(['same'], 'frame-a.png', { type: 'image/png', lastModified: 1 });
        const result = validateJimengReferenceFiles([duplicate, duplicate]);

        expect(result.acceptedFiles).toHaveLength(1);
        expect(result.rejectedFiles).toHaveLength(0);
        expect(result.overflowFiles).toHaveLength(0);
    });

    it('rejects unsupported video and audio files', () => {
        const image = new File(['image'], 'frame-a.png', { type: 'image/png' });
        const video = new File(['video'], 'clip.mp4', { type: 'video/mp4' });
        const audio = new File(['audio'], 'voice.mp3', { type: 'audio/mpeg' });
        const result = validateJimengReferenceFiles([image, video, audio]);

        expect(result.acceptedFiles).toEqual([image]);
        expect(result.rejectedFiles).toEqual([video, audio]);
        expect(getJimengReferenceValidationMessage(result)).toContain('仅支持图片参考图');
    });

    it('caps accepted images at the Jimeng page limit', () => {
        const files = [
            new File(['a'], 'frame-a.png', { type: 'image/png' }),
            new File(['b'], 'frame-b.png', { type: 'image/png' }),
            new File(['c'], 'frame-c.png', { type: 'image/png' }),
        ];

        const result = validateJimengReferenceFiles(files);

        expect(result.acceptedFiles).toHaveLength(JIMENG_MAX_REFERENCE_IMAGES);
        expect(result.overflowFiles).toEqual([files[2]]);
        expect(getJimengReferenceValidationMessage(result)).toContain(String(JIMENG_MAX_REFERENCE_IMAGES));
    });
});
