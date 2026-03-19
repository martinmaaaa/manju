import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  createVideoTaskWithModel,
  generateImageWithModel,
  generateTextWithModel,
  hasLiveImageModelSupport,
  hasLiveTextModelSupport,
  hasLiveVideoModelSupport,
  pollVideoTask,
} from './modelRuntime.js';
import { enqueueJimengJob } from './services/jimengJobManager.js';

function cleanArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function findNode(nodes, nodeId) {
  return cleanArray(nodes).find((node) => node.id === nodeId) || null;
}

function getNodePrimaryValue(node) {
  const outputText = typeof node?.output?.text === 'string' ? node.output.text : '';
  const outputPreview = typeof node?.output?.previewUrl === 'string' ? node.output.previewUrl : '';
  return outputText || outputPreview || String(node?.content || '').trim();
}

function getNodePrompt(node) {
  return String(node?.prompt || '').trim();
}

function isMatchingSourceValue(type, value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return false;
  }

  if (type === 'text') {
    return true;
  }

  if (type === 'image') {
    return /^(data:image\/[\w.+-]+;base64,|https?:\/\/)/i.test(normalized);
  }

  if (type === 'video') {
    return /^(data:video\/[\w.+-]+;base64,|https?:\/\/)/i.test(normalized);
  }

  if (type === 'audio') {
    return /^(data:audio\/[\w.+-]+;base64,|https?:\/\/)/i.test(normalized);
  }

  return false;
}

function getAcceptedInputTypes(definition) {
  return Array.isArray(definition?.accepts)
    ? definition.accepts.filter((value) => typeof value === 'string')
    : [];
}

function getModelGenerationMode(model, modeId) {
  const generationModes = Array.isArray(model?.generationModes) ? model.generationModes.filter((mode) => mode?.id) : [];
  if (generationModes.length === 0) {
    return null;
  }

  return generationModes.find((mode) => mode.id === modeId)
    || generationModes.find((mode) => mode.id === model?.defaultGenerationModeId)
    || generationModes[0]
    || null;
}

function getEnabledInputDefinitions(node, model) {
  const definitions = Object.entries(model?.inputSchema || {}).filter(([, definition]) => Array.isArray(definition?.accepts));
  const activeMode = getModelGenerationMode(model, node?.modeId);
  if (!activeMode) {
    return definitions;
  }

  const enabledInputKeys = new Set(activeMode.enabledInputKeys || []);
  return definitions.filter(([inputKey]) => enabledInputKeys.has(inputKey));
}

export function applyCanvasNodePatch(content, nodeId, patch) {
  const nextContent = {
    ...(content || {}),
    nodes: cleanArray(content?.nodes).map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
    connections: cleanArray(content?.connections),
  };

  return nextContent;
}

export function collectCanvasNodeInputs(content, node, model) {
  const nodes = cleanArray(content?.nodes);
  const connections = cleanArray(content?.connections);
  const enabledDefinitions = new Map(getEnabledInputDefinitions(node, model));
  const groupedInputs = Array.from(enabledDefinitions.entries()).reduce((accumulator, [inputKey, definition]) => {
    accumulator[inputKey] = {
      definition,
      items: [],
    };
    return accumulator;
  }, {});

  if (!model?.inputSchema) {
    return groupedInputs;
  }

  connections
    .filter((connection) => connection.to === node.id)
    .forEach((connection) => {
      const sourceNode = findNode(nodes, connection.from);
      if (!sourceNode) {
        return;
      }

      const sourceType = String(sourceNode.type || '').trim();
      const sourceValue = getNodePrimaryValue(sourceNode);
      if (!sourceType || !isMatchingSourceValue(sourceType, sourceValue)) {
        return;
      }

      const matchingDefinition = enabledDefinitions.get(connection.inputKey);
      if (!matchingDefinition) {
        return;
      }

      if (!getAcceptedInputTypes(matchingDefinition).includes(sourceType)) {
        return;
      }

      groupedInputs[connection.inputKey].items.push({
        node: sourceNode,
        value: sourceValue,
        inputType: sourceType,
      });
    });

  return groupedInputs;
}

function flattenInputsByType(groupedInputs) {
  return Object.values(groupedInputs).reduce((accumulator, bucket) => {
    bucket.items.forEach((item) => {
      if (!accumulator[item.inputType]) {
        accumulator[item.inputType] = [];
      }
      accumulator[item.inputType].push(item);
    });
    return accumulator;
  }, {
    text: [],
    image: [],
    video: [],
    audio: [],
  });
}

function summarizeAssetReferences(groupedInputs) {
  const references = [];

  Object.entries(groupedInputs).forEach(([inputKey, bucket]) => {
    cleanArray(bucket?.items).forEach((item) => {
      const metadata = asObject(item?.node?.metadata);
      const assetId = String(metadata.lockedAssetId || '').trim();
      if (!assetId) {
        return;
      }

      const versionNumber = Number(metadata.sourceVersionNumber);
      references.push({
        assetId,
        assetName: String(metadata.lockedAssetName || item.node?.title || '').trim(),
        assetType: String(metadata.assetType || item.node?.type || '').trim(),
        versionId: String(metadata.sourceVersionId || '').trim() || null,
        versionNumber: Number.isFinite(versionNumber) ? versionNumber : null,
        versionLabel: String(metadata.sourceVersionLabel || '').trim() || 'manual',
        inputKey,
        inputType: item.inputType,
        nodeId: item.node?.id || null,
      });
    });
  });

  return Array.from(new Map(references.map((reference) => [
    `${reference.assetId}:${reference.versionId || 'none'}:${reference.inputKey}:${reference.nodeId || 'none'}`,
    reference,
  ])).values());
}

function summarizeInputCounts(groupedInputs) {
  const inputsByType = flattenInputsByType(groupedInputs);
  return {
    text: inputsByType.text.length,
    image: inputsByType.image.length,
    video: inputsByType.video.length,
    audio: inputsByType.audio.length,
  };
}

function joinTextInputs(node, groupedInputs) {
  const inputsByType = flattenInputsByType(groupedInputs);
  return [
    getNodePrompt(node),
    ...inputsByType.text.map((item) => item.value),
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

function createMockPreview(prefix) {
  return `mock://${prefix}/${Date.now()}/${randomUUID().slice(0, 8)}`;
}

function extensionFromMimeType(mimeType = '') {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('png')) return '.png';
  if (normalized.includes('webp')) return '.webp';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return '.jpg';
  if (normalized.includes('bmp')) return '.bmp';
  if (normalized.includes('mp4')) return '.mp4';
  if (normalized.includes('quicktime') || normalized.includes('mov')) return '.mov';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return '.mp3';
  if (normalized.includes('wav')) return '.wav';
  return '.bin';
}

async function writeReferenceBuffer(buffer, mimeType, directory) {
  await fs.mkdir(directory, { recursive: true });
  const fileName = `jimeng-ref-${Date.now()}-${randomUUID().slice(0, 8)}${extensionFromMimeType(mimeType)}`;
  const filePath = path.join(directory, fileName);
  await fs.writeFile(filePath, buffer);
  const stats = await fs.stat(filePath);
  return {
    path: filePath,
    mimetype: mimeType,
    originalname: fileName,
    size: stats.size,
  };
}

async function downloadReferenceFile(source, directory) {
  if (/^data:[\w.+-]+\/[\w.+-]+;base64,/i.test(source)) {
    const [header, base64Data] = source.split(',', 2);
    const mimeMatch = header.match(/^data:([^;]+);base64$/i);
    const mimeType = mimeMatch?.[1] || 'application/octet-stream';
    const buffer = Buffer.from(base64Data || '', 'base64');
    return writeReferenceBuffer(buffer, mimeType, directory);
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to download reference image: ${response.status}`);
  }

  const mimeType = response.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await response.arrayBuffer());
  return writeReferenceBuffer(buffer, mimeType, directory);
}

function isJimengAllReferenceMode(modeId) {
  return modeId === 'all_references' || modeId === 'references';
}

async function prepareJimengReferenceFiles(groupedInputs, uploadDir, modeId) {
  const referenceSources = isJimengAllReferenceMode(modeId)
    ? [
        ...(groupedInputs.referenceAssets?.items || []).map((item) => item.value),
        ...(groupedInputs.referenceImages?.items || []).map((item) => item.value),
        ...(groupedInputs.referenceVideos?.items || []).map((item) => item.value),
        ...(groupedInputs.referenceAudios?.items || []).map((item) => item.value),
      ].filter(Boolean).slice(0, 12)
    : [
        ...(groupedInputs.startFrame?.items || []).map((item) => item.value),
        ...(groupedInputs.endFrame?.items || []).map((item) => item.value),
      ].filter(Boolean).slice(0, 2);

  if (referenceSources.length === 0) {
    return [];
  }

  const directory = path.join(uploadDir, 'jimeng-node-references');
  const files = [];
  for (const source of referenceSources) {
    files.push(await downloadReferenceFile(source, directory));
  }
  return files;
}

function normalizeNumber(value, fallbackValue) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallbackValue;
}

export async function executeCanvasNode({ content, nodeId, model, uploadDir }) {
  const node = findNode(content?.nodes, nodeId);
  if (!node) {
    throw new Error('Node not found.');
  }

  if (!model) {
    throw new Error('Model not found.');
  }

  const groupedInputs = collectCanvasNodeInputs(content, node, model);
  const inputsByType = flattenInputsByType(groupedInputs);
  const prompt = joinTextInputs(node, groupedInputs);
  const lastRunAt = new Date().toISOString();
  const assetReferences = summarizeAssetReferences(groupedInputs);
  const inputSummary = {
    ...summarizeInputCounts(groupedInputs),
    assetReferences: assetReferences.length,
  };

  if (model.modality === 'text') {
    const finalPrompt = prompt || String(node.content || '').trim();
    if (!finalPrompt) {
      throw new Error('文本节点缺少提示内容。');
    }

    const textOutput = hasLiveTextModelSupport(model)
      ? await generateTextWithModel({
          model,
          prompt: finalPrompt,
          contents: inputsByType.image.length > 0 ? [{
            role: 'user',
            parts: [
              { type: 'text', text: finalPrompt },
              ...inputsByType.image.map((item) => ({
                type: 'imageUrl',
                url: item.value,
              })),
            ],
          }] : undefined,
          temperature: normalizeNumber(node.params?.temperature, 0.3),
        })
      : finalPrompt;

    return {
      pending: false,
      content: applyCanvasNodePatch(content, nodeId, {
        content: textOutput,
        output: {
          ...(asObject(node.output)),
          text: textOutput,
          metadata: {
            ...(asObject(node.output?.metadata)),
            assetReferences,
            inputSummary,
          },
        },
        runStatus: 'success',
        error: null,
        lastRunAt,
      }),
    };
  }

  if (model.modality === 'image') {
    if (!prompt) {
      throw new Error('图片节点缺少文本提示。');
    }

    const previewUrl = hasLiveImageModelSupport(model)
      ? await generateImageWithModel({
          model,
          prompt,
          aspectRatio: String(node.params?.aspectRatio || model.configSchema?.aspectRatio?.default || '1:1'),
          imageSize: String(node.params?.imageSize || model.configSchema?.imageSize?.default || '2K'),
          referenceImages: (groupedInputs.referenceImages?.items || []).map((item) => item.value),
        })
      : createMockPreview('canvas-image');

    return {
      pending: false,
      content: applyCanvasNodePatch(content, nodeId, {
        content: previewUrl,
        output: {
          ...(asObject(node.output)),
          previewUrl,
          metadata: {
            ...(asObject(node.output?.metadata)),
            assetReferences,
            inputSummary,
          },
        },
        runStatus: 'success',
        error: null,
        lastRunAt,
      }),
    };
  }

  if (model.modality === 'video' && model.adapter === 'jimeng-video-generation') {
    if (!prompt) {
      throw new Error('视频节点缺少文本提示。');
    }

    const activeModeId = node.modeId || model.defaultGenerationModeId || '';
    const referenceFiles = await prepareJimengReferenceFiles(groupedInputs, uploadDir, activeModeId);
    const job = await enqueueJimengJob({
      prompt,
      referenceFiles,
      metadata: {
        source: 'canvas-node',
        nodeId,
        modelId: model.deploymentId,
        modeId: activeModeId || null,
        inputKeys: Object.keys(groupedInputs).filter((inputKey) => groupedInputs[inputKey]?.items?.length > 0),
        assetReferences,
        inputSummary,
      },
    });

    return {
      pending: true,
      providerJob: job,
      content: applyCanvasNodePatch(content, nodeId, {
        runStatus: 'running',
        error: null,
        lastRunAt,
        output: {
          ...(asObject(node.output)),
          providerJobId: job.id,
          metadata: {
            provider: 'jimeng',
            phase: job.phase,
            status: job.status,
            modeId: activeModeId || null,
            assetReferences,
            inputSummary,
          },
        },
      }),
    };
  }

  if (model.modality === 'video') {
    if (!prompt) {
      throw new Error('视频节点缺少文本提示。');
    }

    const taskId = hasLiveVideoModelSupport(model)
      ? await createVideoTaskWithModel({
          model,
          prompt,
          ratio: String(node.params?.ratio || model.configSchema?.ratio?.default || '9:16'),
          resolution: String(node.params?.resolution || model.configSchema?.resolution?.default || '720P'),
          duration: normalizeNumber(node.params?.durationSeconds, Number(model.configSchema?.durationSeconds?.default || 5)),
          images: (groupedInputs.referenceImages?.items || []).map((item) => item.value),
        })
      : null;
    const result = taskId ? await pollVideoTask({ taskId }) : null;
    const previewUrl = result?.output || createMockPreview('canvas-video');

    return {
      pending: false,
      content: applyCanvasNodePatch(content, nodeId, {
        content: previewUrl,
        output: {
          ...(asObject(node.output)),
          previewUrl,
          providerJobId: taskId || undefined,
          metadata: {
            ...(asObject(node.output?.metadata)),
            assetReferences,
            inputSummary,
          },
        },
        runStatus: 'success',
        error: null,
        lastRunAt,
      }),
    };
  }

  throw new Error(`Unsupported node modality: ${model.modality}`);
}
