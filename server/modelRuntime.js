function getBaseUrl() {
  return (process.env.BLTCY_BASE_URL || 'https://api.bltcy.ai').replace(/\/+$/, '');
}

function getApiKey() {
  return process.env.BLTCY_API_KEY?.trim() || '';
}

function extractJson(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error('Model returned empty content.');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const codeFenceMatch = trimmed.match(/```json\s*([\s\S]+?)```/i);
    if (codeFenceMatch) {
      return JSON.parse(codeFenceMatch[1]);
    }

    const objectMatch = trimmed.match(/\{[\s\S]*\}$/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }

    throw new Error('Model did not return valid JSON.');
  }
}

function assertConfigured() {
  if (!getApiKey()) {
    throw new Error('BLTCY_API_KEY is not configured on the server.');
  }
}

function isBltcyAdapter(model, adapter) {
  return Boolean(model) && model.adapter === adapter;
}

function getProviderModelId(model) {
  return model?.providerModelId || model?.deploymentId || '';
}

export function hasLiveTextModelSupport(model) {
  return Boolean(getApiKey()) && isBltcyAdapter(model, 'bltcy-openai-chat');
}

export function hasLiveImageModelSupport(model) {
  return Boolean(getApiKey()) && isBltcyAdapter(model, 'bltcy-image-generation');
}

export function hasLiveVideoModelSupport(model) {
  return Boolean(getApiKey()) && isBltcyAdapter(model, 'bltcy-video-generation');
}

export function hasLiveModelSupport(model) {
  return hasLiveTextModelSupport(model) || hasLiveImageModelSupport(model) || hasLiveVideoModelSupport(model);
}

export async function generateTextWithModel({
  model,
  prompt,
  systemInstruction,
  contents,
  temperature = 0.3,
}) {
  assertConfigured();

  const userContent = Array.isArray(contents) && contents.length > 0
    ? contents.map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: Array.isArray(message.parts)
          ? message.parts.map((part) => {
              if (part?.type === 'inlineData' && part?.data) {
                if (String(part.mimeType || '').startsWith('audio/')) {
                  return {
                    type: 'input_audio',
                    input_audio: {
                      data: String(part.data),
                      format: String(part.mimeType || 'audio/wav').split('/')[1] || 'wav',
                    },
                  };
                }

                return {
                  type: 'image_url',
                  image_url: {
                    url: `data:${part.mimeType || 'image/png'};base64,${part.data}`,
                  },
                };
              }

              if (part?.type === 'imageUrl' && part?.url) {
                return {
                  type: 'image_url',
                  image_url: {
                    url: String(part.url),
                  },
                };
              }

              return {
                type: 'text',
                text: String(part?.text || ''),
              };
            }).filter(Boolean)
          : [{ type: 'text', text: String(prompt || '') }],
      }))
    : [{
        role: 'user',
        content: [{ type: 'text', text: String(prompt || '') }],
      }];

  const messages = [];
  if (systemInstruction) {
    messages.push({
      role: 'system',
      content: String(systemInstruction),
    });
  }
  messages.push(...userContent);

  const response = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: getProviderModelId(model),
      temperature,
      messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`BLTCY chat failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  return String(data?.choices?.[0]?.message?.content || '').trim();
}

export async function generateJsonWithModel({
  model,
  systemInstruction,
  prompt,
  temperature = 0.3,
}) {
  assertConfigured();

  const response = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: getProviderModelId(model),
      temperature,
      messages: [
        {
          role: 'system',
          content: `${systemInstruction}\nAlways respond with a single JSON object and no markdown fences.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: {
        type: 'json_object',
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`BLTCY chat failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  return extractJson(text);
}

export async function generateImageWithModel({
  model,
  prompt,
  aspectRatio = '9:16',
  imageSize = '2K',
  referenceImages = [],
}) {
  assertConfigured();

  const response = await fetch(`${getBaseUrl()}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: getProviderModelId(model),
      prompt,
      aspect_ratio: aspectRatio,
      image_size: imageSize,
      response_format: 'url',
      image: Array.isArray(referenceImages) ? referenceImages : [],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`BLTCY image generation failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const first = Array.isArray(data?.data) ? data.data[0] : null;
  return first?.url || first?.b64_json || null;
}

export async function createVideoTaskWithModel({
  model,
  prompt,
  ratio = '9:16',
  resolution = '720P',
  duration = 5,
  images = [],
  generateAudio = false,
  audioReferenceUrls = [],
}) {
  assertConfigured();

  const supportsAudioOutput = Boolean(model?.configSchema?.generateAudio);
  const requestHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getApiKey()}`,
  };
  const basePayload = {
    prompt,
    model: getProviderModelId(model),
    ratio,
    resolution,
    duration,
    images: Array.isArray(images) ? images : [],
  };
  const primaryPayload = {
    ...basePayload,
    ...(supportsAudioOutput && generateAudio ? { generate_audio: true } : {}),
    ...(supportsAudioOutput && generateAudio && Array.isArray(audioReferenceUrls) && audioReferenceUrls.length > 0
      ? { audio_urls: audioReferenceUrls }
      : {}),
  };

  let response = await fetch(`${getBaseUrl()}/v2/videos/generations`, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(primaryPayload),
  });

  if (!response.ok && Array.isArray(primaryPayload.audio_urls) && primaryPayload.audio_urls.length > 0) {
    const fallbackPayload = {
      ...basePayload,
      ...(supportsAudioOutput && generateAudio ? { generate_audio: true } : {}),
    };

    response = await fetch(`${getBaseUrl()}/v2/videos/generations`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(fallbackPayload),
    });
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`BLTCY video creation failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  return data?.task_id || null;
}

export async function pollVideoTask({ taskId, timeoutMs = 60_000, intervalMs = 3000 }) {
  assertConfigured();

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`${getBaseUrl()}/v2/videos/generations/${encodeURIComponent(taskId)}`, {
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`BLTCY video polling failed: ${response.status} ${body}`);
    }

    const data = await response.json();
    const status = String(data?.status || '').toUpperCase();
    if (status === 'SUCCESS') {
      return {
        status,
        output: data?.data?.output || null,
        raw: data,
      };
    }

    if (status === 'FAILURE') {
      throw new Error(data?.fail_reason || 'Video generation failed.');
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Video generation timed out.');
}
