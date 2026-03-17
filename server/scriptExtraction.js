import fs from 'fs/promises';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const SCENE_SUFFIXES = ['宫', '殿', '府', '院', '阁', '楼', '街', '巷', '村', '城', '山', '林', '湖', '海', '厅', '室', '房', '桥', '寺', '庙'];
const PROP_KEYWORDS = ['玉佩', '匕首', '长剑', '信件', '书信', '令牌', '手机', '相机', '伞', '项链', '戒指', '簪子', '药瓶', '卷轴'];

export async function extractScriptContent({ filePath, mimeType, originalName, textContent }) {
  if (typeof textContent === 'string' && textContent.trim()) {
    return normalizeScriptText(textContent);
  }

  if (!filePath) {
    return '';
  }

  const lowerName = String(originalName || '').toLowerCase();
  const normalizedMime = String(mimeType || '').toLowerCase();

  if (normalizedMime.includes('pdf') || lowerName.endsWith('.pdf')) {
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    return normalizeScriptText(parsed.text || '');
  }

  if (
    normalizedMime.includes('wordprocessingml') ||
    normalizedMime.includes('msword') ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.doc')
  ) {
    const result = await mammoth.extractRawText({ path: filePath });
    return normalizeScriptText(result.value || '');
  }

  const raw = await fs.readFile(filePath, 'utf8');
  return normalizeScriptText(raw);
}

export function normalizeScriptText(input) {
  return String(input || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractTitle(scriptText, fallbackTitle = '未命名项目') {
  const headingMatch = scriptText.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();

  const bracketTitle = scriptText.match(/《([^》]{2,40})》/);
  if (bracketTitle) return bracketTitle[1].trim();

  const firstLine = scriptText.split('\n').map((line) => line.trim()).find(Boolean);
  if (firstLine && firstLine.length <= 40) return firstLine.replace(/^#+\s*/, '');

  return fallbackTitle;
}

export function splitEpisodes(scriptText) {
  const lines = scriptText.split('\n');
  const markers = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (/^#{1,3}\s*第?[0-9一二三四五六七八九十百]+[集话章节回]/.test(trimmed) || /^episode\s+\d+/i.test(trimmed)) {
      markers.push({ index, title: trimmed.replace(/^#+\s*/, '') });
    }
  });

  if (markers.length > 0) {
    return markers.map((marker, index) => {
      const nextIndex = markers[index + 1]?.index ?? lines.length;
      const content = lines.slice(marker.index, nextIndex).join('\n').trim();
      return {
        episodeNumber: index + 1,
        title: marker.title,
        content,
      };
    });
  }

  const paragraphs = scriptText
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (paragraphs.length <= 6) {
    return [
      {
        episodeNumber: 1,
        title: '第1集',
        content: scriptText,
      },
    ];
  }

  const episodeCount = Math.min(8, Math.max(2, Math.ceil(paragraphs.length / 6)));
  const chunkSize = Math.ceil(paragraphs.length / episodeCount);

  return Array.from({ length: episodeCount }, (_, index) => {
    const chunk = paragraphs.slice(index * chunkSize, (index + 1) * chunkSize).join('\n\n').trim();
    return {
      episodeNumber: index + 1,
      title: `第${index + 1}集`,
      content: chunk,
    };
  }).filter((episode) => episode.content);
}

export function extractCharacters(scriptText) {
  const scores = new Map();
  const add = (name) => {
    const normalized = String(name || '').trim();
    if (!normalized || normalized.length > 8) return;
    if (/^(第.+集|scene|角色|人物|旁白|系统)$/i.test(normalized)) return;
    scores.set(normalized, (scores.get(normalized) || 0) + 1);
  };

  for (const match of scriptText.matchAll(/^(?:[-*]\s*)?([A-Za-z]{2,20}|[\u4e00-\u9fa5]{2,5})[：:]/gm)) {
    add(match[1]);
  }

  for (const match of scriptText.matchAll(/(?:人物|角色)[:：]\s*([^\n]+)/g)) {
    match[1]
      .split(/[、，,\/]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach(add);
  }

  return Array.from(scores.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([name]) => ({
      name,
      description: `${name}，在当前剧本中反复出现的核心角色。`,
    }));
}

export function extractScenes(scriptText) {
  const scores = new Map();

  for (const suffix of SCENE_SUFFIXES) {
    const pattern = new RegExp(`[\\u4e00-\\u9fa5]{2,10}${suffix}`, 'g');
    for (const match of scriptText.matchAll(pattern)) {
      const scene = match[0].trim();
      scores.set(scene, (scores.get(scene) || 0) + 1);
    }
  }

  const scenes = Array.from(scores.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([name]) => ({
      name,
      description: `${name}，项目中的关键叙事场景。`,
    }));

  if (scenes.length > 0) {
    return scenes;
  }

  return [
    {
      name: '主场景',
      description: '围绕当前剧本的核心行动空间建立主场景设定。',
    },
  ];
}

export function extractProps(scriptText) {
  const props = PROP_KEYWORDS.filter((keyword) => scriptText.includes(keyword)).slice(0, 6).map((name) => ({
    name,
    description: `${name}，在剧本中具有叙事功能的关键道具。`,
  }));

  return props;
}

export function summarizeScript(scriptText) {
  const paragraphs = scriptText
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);

  return paragraphs.join('\n\n').slice(0, 800);
}

export function buildStoryBible({ projectTitle, scriptText, setup }) {
  const characters = extractCharacters(scriptText);
  const scenes = extractScenes(scriptText);
  const props = extractProps(scriptText);
  const episodes = splitEpisodes(scriptText);
  const title = extractTitle(scriptText, projectTitle);
  const summary = summarizeScript(scriptText);

  return {
    title,
    logline: summary.slice(0, 180) || `${projectTitle} 的核心故事概述。`,
    summary,
    worldRules: [
      '保持人物关系与世界观在各集之间的一致性。',
      '单集工作台只消费本集上下文和锁定资产，不继承整张旧画布。',
      '视频提示词围绕完整叙事段落生成，而不是孤立镜头关键词堆砌。',
    ],
    styleSignals: {
      aspectRatio: setup?.aspectRatio || '9:16',
      styleSummary: setup?.styleSummary || '',
      targetMedium: setup?.targetMedium || '漫剧',
      globalPrompts: setup?.globalPrompts || [],
    },
    characters,
    scenes,
    props,
    episodes: episodes.map((episode) => ({
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      synopsis: summarizeScript(episode.content) || `${episode.title} 的剧情概要。`,
      sourceText: episode.content,
    })),
    continuityRules: [
      '角色视觉设定以锁定资产为准。',
      '连续性摘要由前集梗概、场景变化和资产锁定状态共同生成。',
      '同名资产在项目范围内只维护一个 canonical source。',
    ],
  };
}

export function buildEpisodeContext({ project, episode, previousEpisodes, lockedAssets }) {
  const previousSummary = previousEpisodes
    .map((item) => `${item.title}：${item.synopsis}`)
    .join('\n')
    .slice(0, 1200);
  const assetSummary = lockedAssets
    .map((asset) => `${asset.type}:${asset.name}`)
    .join('、');

  const contextSummary = [
    `项目设定：${project.setup?.styleSummary || '未设置风格说明'}`,
    previousSummary ? `前文摘要：${previousSummary}` : '',
    assetSummary ? `锁定资产：${assetSummary}` : '',
    `本集目标：${episode.synopsis}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    contextSummary,
    precedingSummary: previousSummary,
    worldState: {
      storyBibleTitle: project.storyBible?.title || project.title,
      styleSummary: project.setup?.styleSummary || '',
      targetMedium: project.setup?.targetMedium || '漫剧',
    },
    continuityState: {
      lockedAssetIds: lockedAssets.map((asset) => asset.id),
      previousEpisodeCount: previousEpisodes.length,
    },
  };
}

export function buildEpisodeWorkspaceSeed({ episode, lockedAssets, storyBible, promptRecipeId }) {
  const promptSeed = [
    `请围绕 ${episode.title} 生成一段完整的动态叙事视频提示词。`,
    storyBible?.styleSignals?.styleSummary ? `整体风格：${storyBible.styleSignals.styleSummary}` : '',
    lockedAssets.length > 0 ? `必须使用的锁定资产：${lockedAssets.map((asset) => asset.name).join('、')}` : '',
    promptRecipeId ? `提示词写法：${promptRecipeId}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    nodes: [
      {
        id: `script-${episode.id}`,
        type: 'text',
        title: '本集脚本',
        x: 60,
        y: 80,
        width: 320,
        height: 220,
        content: episode.synopsis,
      },
      {
        id: `storyboard-${episode.id}`,
        type: 'text',
        title: '分镜节拍',
        x: 440,
        y: 80,
        width: 320,
        height: 220,
        content: '待补充分镜节拍与镜头运动。',
      },
      {
        id: `prompt-${episode.id}`,
        type: 'text',
        title: '视频提示词',
        x: 820,
        y: 80,
        width: 360,
        height: 260,
        content: promptSeed,
      },
      {
        id: `visual-${episode.id}`,
        type: 'image',
        title: '视觉参考',
        x: 120,
        y: 360,
        width: 300,
        height: 220,
        content: '',
      },
      {
        id: `audio-${episode.id}`,
        type: 'audio',
        title: '音频设计',
        x: 500,
        y: 360,
        width: 300,
        height: 220,
        content: '对白、环境音与音乐提示待补充。',
      },
      {
        id: `video-${episode.id}`,
        type: 'video',
        title: '视频输出',
        x: 880,
        y: 380,
        width: 300,
        height: 220,
        content: '',
      },
    ],
  };
}
