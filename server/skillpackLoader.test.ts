import { describe, expect, it } from 'vitest';
import { loadSeedanceSkillPacks } from './skillpackLoader.js';

describe('skillpackLoader', () => {
  it('loads official Seedance skillpacks from manifest files', () => {
    const skillpacks = loadSeedanceSkillPacks();
    const ids = skillpacks.map((item) => item.id);

    expect(ids).toEqual([
      'seedance-art-design-v1',
      'seedance-director-v1',
      'seedance-episode-director-v1',
      'seedance-storyboard-v1',
    ]);
  });

  it('hydrates assets, references, scripts, and capability schemas from the Seedance directories', () => {
    const storyboardPack = loadSeedanceSkillPacks().find((item) => item.id === 'seedance-storyboard-v1');

    expect(storyboardPack).toBeTruthy();
    expect(storyboardPack?.assets.primaryOutput).toBe('seedance-prompts');
    expect(storyboardPack?.assets.directories).toContain(
      'Seedance 2.0 AI 分镜师团队/skills/seedance-storyboard-skill/assets',
    );
    expect(storyboardPack?.assets.files?.some((item) => item.endsWith('/seedance-prompts-template.md'))).toBe(true);
    expect(storyboardPack?.assets.documents?.[0]?.content.length).toBeGreaterThan(20);
    expect(storyboardPack?.references?.directories).toContain(
      'Seedance 2.0 AI 分镜师团队/skills/seedance-storyboard-skill/references',
    );
    expect(storyboardPack?.references?.sourceMaterials?.some((item) => item.endsWith('/SKILL.md'))).toBe(true);
    expect(storyboardPack?.references?.documents?.[0]?.previewText.length).toBeGreaterThan(10);
    expect(storyboardPack?.scripts?.directories).toContain(
      'Seedance 2.0 AI 分镜师团队/skills/seedance-storyboard-skill/scripts',
    );
    expect(storyboardPack?.scripts?.entries).toEqual([]);
    expect(storyboardPack?.schemasByCapability?.video_prompt_generate?.id).toBe('seedance-storyboard-core-v1');
    expect(storyboardPack?.schemasByCapability?.storyboard_generate?.id).toBe('seedance-storyboard-core-v1');
  });
});
