import { describe, expect, it } from 'vitest';
import { getSkillPack, resolveSkillPackCapabilitySchema } from './registries.js';

describe('registries', () => {
  it('resolves capability-specific schemas from a shared skill pack', () => {
    const pack = getSkillPack('seedance-art-design-v1');

    const assetExtractSchema = resolveSkillPackCapabilitySchema(pack, 'asset_extract');
    const imagePromptSchema = resolveSkillPackCapabilitySchema(pack, 'image_prompt_generate');

    expect(assetExtractSchema.schemaId).toBe('seedance-asset-design-core-v1');
    expect(imagePromptSchema.schemaId).toBe('seedance-image-prompt-core-v1');
    expect(imagePromptSchema.schema?.id).toBe('seedance-image-prompt-core-v1');
  });
});
