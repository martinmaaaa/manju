import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const brandingPath = path.join(repoRoot, 'src', 'branding.ts');
const logoPath = path.join(repoRoot, 'public', 'logo.png');

const fallbackBranding = {
  brandName: '添梯',
  brandNameEn: 'Tianti',
  workspaceName: '添梯工作台',
  tagline: '给创作者一把向上走的梯子',
  description: '添梯把剧本、人物资产、分镜、提示词到视频生成整理成逐级向上的固定工作流，让创作像爬梯子一样稳步向上。',
  assistantName: '添梯助手',
  welcomeTitle: '把灵感一步一步抬上去',
  welcomeSubtitle: '从剧本到视频，用固定工作流稳步推进创作。',
  logoAlt: '添梯 Logo',
};

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('Missing GEMINI_API_KEY environment variable.');
}

const ai = new GoogleGenAI({ apiKey });

async function generateBrandingCopy() {
  const prompt = `
你是一个中文互联网产品的品牌顾问。
现在要把一个 AI 创作工作流产品整体改名为“添梯”，核心隐喻是：给创作者提供一把向上走的梯子，让创作从灵感到成片一级一级稳步推进。

请返回严格 JSON，对象中只允许包含以下字段：
- brandName
- brandNameEn
- workspaceName
- tagline
- description
- assistantName
- welcomeTitle
- welcomeSubtitle
- logoAlt

要求：
1. 全部字段为字符串。
2. 以中文为主，英文名简洁。
3. 文案要有“向上、递进、工作流、创作”气质。
4. 不要出现 markdown，不要解释。
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
    },
  });

  const parsed = JSON.parse(response.text || '{}');
  return {
    ...fallbackBranding,
    ...parsed,
  };
}

async function generateLogo() {
  const prompt = `
Create a premium square app logo icon for a creative AI workflow product named "Tianti" (添梯).
Visual metaphor: an abstract ladder merging into an upward path or ascending steps.
Style: minimal, modern, polished, futuristic, dark product brand, elegant cyan to violet glow, subtle depth, centered composition.
Background: deep charcoal / near-black so it works inside a dark UI.
Do not include any text, letters, watermarks, frames, UI chrome, mockups, or people.
The result must feel like a SaaS creative tool icon, clean and memorable.
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: '1:1',
      },
    },
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    throw new Error('Gemini did not return logo image data.');
  }

  return Buffer.from(imagePart.inlineData.data, 'base64');
}

function buildBrandingFile(branding) {
  return `export const BRANDING = ${JSON.stringify(branding, null, 2)} as const;

export const BRAND_NAME = BRANDING.brandName;
export const BRAND_NAME_EN = BRANDING.brandNameEn;
export const BRAND_WORKSPACE_NAME = BRANDING.workspaceName;
export const BRAND_TAGLINE = BRANDING.tagline;
export const BRAND_DESCRIPTION = BRANDING.description;
export const BRAND_ASSISTANT_NAME = BRANDING.assistantName;
export const BRAND_WELCOME_TITLE = BRANDING.welcomeTitle;
export const BRAND_WELCOME_SUBTITLE = BRANDING.welcomeSubtitle;
export const BRAND_LOGO_ALT = BRANDING.logoAlt;
`;
}

async function main() {
  const branding = await generateBrandingCopy();
  const logoBuffer = await generateLogo();

  await mkdir(path.dirname(brandingPath), { recursive: true });
  await mkdir(path.dirname(logoPath), { recursive: true });

  await writeFile(brandingPath, buildBrandingFile(branding), 'utf8');
  await writeFile(logoPath, logoBuffer);

  console.log(JSON.stringify({
    brandingPath,
    logoPath,
    branding,
  }, null, 2));
}

main().catch((error) => {
  console.error('[generate-tianti-branding] Failed:', error);
  process.exitCode = 1;
});
