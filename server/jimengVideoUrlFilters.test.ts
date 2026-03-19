import { describe, expect, it } from 'vitest';
import { isIgnoredJimengVideoUrl, looksLikeReusableJimengVideoUrl } from './jimengVideoUrlFilters.js';

describe('jimengVideoUrlFilters', () => {
  it('ignores jimeng loading animation urls', () => {
    expect(isIgnoredJimengVideoUrl('https://lf3-lv-buz.vlabstatic.com/static/media/record-loading-animation-light.90e5afc5.mp4')).toBe(true);
    expect(looksLikeReusableJimengVideoUrl('https://lf3-lv-buz.vlabstatic.com/static/media/record-loading-animation-light.90e5afc5.mp4')).toBe(false);
  });

  it('keeps real media urls eligible', () => {
    expect(looksLikeReusableJimengVideoUrl('https://cdn.example.com/generated/final-video.mp4')).toBe(true);
  });
});
