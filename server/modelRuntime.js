const BLTCY_BASE_URL = (process.env.BLTCY_BASE_URL || 'https://api.bltcy.ai').replace(/\/+$/, '');
const BLTCY_API_KEY = process.env.BLTCY_API_KEY?.trim() || '';

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
  if (!BLTCY_API_KEY) {
    throw new Error('BLTCY_API_KEY is not configured on the server.');
  }
}

function isBltcyAdapter(model, adapter) {
  return Boolean(model) && model.adapter === adapter;
}

export function hasLiveTextModelSupport(model) {
  return Boolean(BLTCY_API_KEY) && isBltcyAdapter(model, 'bltcy-openai-chat');
}

export function hasLiveImageModelSupport(model) {
  return Boolean(BLTCY_API_KEY) && isBltcyAdapter(model, 'bltcy-image-generation');
}

export function hasLiveVideoModelSupport(model) {
  return Boolean(BLTCY_API_KEY) && isBltcyAdapter(model, 'bltcy-video-generation');
}

export function hasLiveModelSupport(model) {
  return hasLiveTextModelSupport(model) || hasLiveImageModelSupport(model) || hasLiveVideoModelSupport(model);
}

export async function generateJsonWithModel({
  model,
  systemInstruction,
  prompt,
  temperature = 0.3,
}) {
  assertConfigured();

  const response = await fetch(`${BLTCY_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${BLTCY_API_KEY}`,
    },
    body: JSON.stringify({
      model: model.id,
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

  const response = await fetch(`${BLTCY_BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${BLTCY_API_KEY}`,
    },
    body: JSON.stringify({
      model: model.id,
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
}) {
  assertConfigured();

  const response = await fetch(`${BLTCY_BASE_URL}/v2/videos/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${BLTCY_API_KEY}`,
    },
    body: JSON.stringify({
      prompt,
      model: model.id,
      ratio,
      resolution,
      duration,
      images: Array.isArray(images) ? images : [],
    }),
  });

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
    const response = await fetch(`${BLTCY_BASE_URL}/v2/videos/generations/${encodeURIComponent(taskId)}`, {
      headers: {
        Authorization: `Bearer ${BLTCY_API_KEY}`,
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
