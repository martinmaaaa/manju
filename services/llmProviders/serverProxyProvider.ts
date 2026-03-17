import { LLMProvider, GenerateImageOptions, GenerateContentOptions } from './baseProvider';
import { LLMProviderType } from '../../types';

const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

function normalizeParts(parts: any[] = []) {
  return parts.map((part) => {
    if (part?.text) {
      return { type: 'text', text: String(part.text) };
    }

    if (part?.inlineData?.data) {
      return {
        type: 'inlineData',
        mimeType: String(part.inlineData.mimeType || 'application/octet-stream'),
        data: String(part.inlineData.data),
      };
    }

    return null;
  }).filter(Boolean);
}

function normalizeContents(contents: any) {
  if (!contents) return null;

  if (Array.isArray(contents)) {
    return contents.map((item) => ({
      role: item?.role || 'user',
      parts: normalizeParts(item?.parts || []),
    }));
  }

  if (Array.isArray(contents?.parts)) {
    return [{
      role: 'user',
      parts: normalizeParts(contents.parts),
    }];
  }

  return null;
}

async function postJson<T>(path: string, payload: Record<string, unknown>) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.error || `HTTP ${response.status}`);
  }

  return json as { success: boolean; data?: T; error?: string };
}

export class ServerProxyProvider implements LLMProvider {
  getType(): LLMProviderType {
    return 'server';
  }

  getName(): string {
    return 'Server Proxy';
  }

  getClient(): any {
    return {
      models: {
        generateContent: async ({ model, contents, config }: any) => {
          if (Array.isArray(config?.responseModalities) && config.responseModalities.includes('AUDIO')) {
            throw new Error('Legacy audio synthesis is not supported by the server proxy yet.');
          }

          const response = await postJson<{ text: string }>('/legacy/llm/content', {
            model,
            contents: normalizeContents(contents),
            options: {
              responseMimeType: config?.responseMimeType,
              systemInstruction: config?.systemInstruction,
            },
          });

          const text = response.data?.text || '';
          return {
            text,
            response: {
              candidates: [
                {
                  content: {
                    parts: [{ text }],
                  },
                },
              ],
            },
            candidates: [
              {
                content: {
                  parts: [{ text }],
                },
              },
            ],
          };
        },
        generateVideos: async ({ model, prompt, image, config }: any) => {
          const response = await postJson<{ operation: any }>('/legacy/llm/video', {
            model,
            prompt,
            image,
            config,
          });

          return response.data?.operation || { done: true, response: { generatedVideos: [] } };
        },
      },
      operations: {
        getVideosOperation: async ({ operation }: any) => {
          return operation;
        },
      },
      live: {
        connect: async () => {
          throw new Error('Legacy live audio sessions are not supported by the server proxy yet.');
        },
      },
    };
  }

  async generateContent(
    prompt: string,
    model: string,
    options?: GenerateContentOptions,
  ): Promise<string> {
    const response = await postJson<{ text: string }>('/legacy/llm/content', {
      model,
      prompt,
      contents: normalizeContents(options?.contents),
      options,
    });
    return response.data?.text || '';
  }

  async generateImages(
    prompt: string,
    model: string,
    referenceImages?: string[],
    options?: GenerateImageOptions,
  ): Promise<string[]> {
    const response = await postJson<{ images: string[] }>('/legacy/llm/images', {
      model,
      prompt,
      referenceImages,
      options,
    });
    return response.data?.images || [];
  }

  async validateApiKey(): Promise<boolean> {
    return true;
  }
}
