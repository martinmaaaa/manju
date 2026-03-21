import type {
  CanvasNode,
  Episode,
  EpisodeContext,
  EpisodeShotClip,
  EpisodeShotJob,
  EpisodeShotSlot,
  EpisodeShotStrip,
} from '../../../types/workflowApp';

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

interface ShotSeed {
  title?: string;
  summary: string;
  promptText?: string;
  durationLabel?: string;
  recommendedModelId?: string;
  recommendedModeId?: string;
  referenceAssetNames?: string[];
}

function asShotSeeds(value: unknown): ShotSeed[] {
  return Array.isArray(value)
    ? value
        .map((item) => ({
          title: String((item as Record<string, unknown>)?.title || '').trim(),
          summary: String((item as Record<string, unknown>)?.summary || '').trim(),
          promptText: String((item as Record<string, unknown>)?.promptText || '').trim(),
          durationLabel: String((item as Record<string, unknown>)?.durationLabel || '').trim(),
          recommendedModelId: String((item as Record<string, unknown>)?.recommendedModelId || '').trim(),
          recommendedModeId: String((item as Record<string, unknown>)?.recommendedModeId || '').trim(),
          referenceAssetNames: asStringArray((item as Record<string, unknown>)?.referenceAssetNames),
        }))
        .filter((item) => item.summary)
    : [];
}

function estimateShotCount(text: string, index: number) {
  const punctuationWeight = (text.match(/[，。！？；:：]/g) || []).length;
  return Math.max(3, Math.min(13, punctuationWeight + 2 + (index % 3)));
}

export function formatShotDurationLabel(seconds: number) {
  const clamped = Math.max(1, Math.min(59, seconds));
  return `00:${String(clamped).padStart(2, '0')}`;
}

export function splitShotStripSegments(text: string) {
  return String(text || '')
    .split(/\n{2,}|(?=【场景】)|(?=\d+\s*-\s*\d+)/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildShotSeeds(
  episode: Episode | null,
  episodeContext: EpisodeContext | null,
  storyboardText: string,
): ShotSeed[] {
  const content = (episodeContext?.content as Record<string, unknown> | undefined) || {};
  const storyboardShots = asShotSeeds(content.storyboardShots);
  if (storyboardShots.length > 0) {
    return storyboardShots;
  }

  const storyboardBeats = asStringArray(content.storyboardBeats);
  if (storyboardBeats.length > 0) {
    return storyboardBeats.map((summary, index) => ({
      title: `镜头${index + 1}`,
      summary,
    }));
  }

  const storyboardSegments = splitShotStripSegments(storyboardText);
  if (storyboardSegments.length > 0) {
    return storyboardSegments.slice(0, 12).map((summary, index) => ({
      title: `镜头${index + 1}`,
      summary,
    }));
  }

  return splitShotStripSegments(episode?.sourceText || episode?.synopsis || '').slice(0, 6).map((summary, index) => ({
    title: `镜头${index + 1}`,
    summary,
  }));
}

function buildPromptSegments(videoPromptText: string, segmentCount: number) {
  const promptSegments = splitShotStripSegments(videoPromptText);
  if (promptSegments.length === 0) {
    return Array.from({ length: segmentCount }, () => '');
  }

  return Array.from({ length: segmentCount }, (_, index) => promptSegments[index] || promptSegments[promptSegments.length - 1] || '');
}

function withShotTimeline(slots: EpisodeShotSlot[]): EpisodeShotSlot[] {
  let currentSeconds = 0;

  return slots.map((slot) => {
    const durationSeconds = parseShotDurationSeconds(slot.durationLabel);
    const nextSlot = {
      ...slot,
      startSeconds: currentSeconds,
      endSeconds: currentSeconds + durationSeconds,
    };
    currentSeconds += durationSeconds;
    return nextSlot;
  });
}

export function normalizeEpisodeShotStrip(strip: EpisodeShotStrip | null | undefined): EpisodeShotStrip {
  return {
    selectedShotId: strip?.selectedShotId || null,
    slots: withShotTimeline(
      Array.isArray(strip?.slots)
        ? strip.slots
          .filter((slot): slot is EpisodeShotSlot => Boolean(slot?.id))
          .sort((left, right) => left.order - right.order)
        : [],
    ),
    removedSlotIds: Array.isArray(strip?.removedSlotIds)
      ? Array.from(new Set(strip.removedSlotIds.map((item) => String(item || '').trim()).filter(Boolean)))
      : [],
  };
}

export function buildEpisodeShotStrip(params: {
  episode: Episode | null;
  episodeContext: EpisodeContext | null;
  storyboardText: string;
  videoPromptText: string;
  currentStrip?: EpisodeShotStrip | null;
}): EpisodeShotStrip {
  const { episode, episodeContext, storyboardText, videoPromptText, currentStrip } = params;
  const current = normalizeEpisodeShotStrip(currentStrip);
  const storyboardSeeds = buildShotSeeds(episode, episodeContext, storyboardText);
  const promptSegments = buildPromptSegments(videoPromptText, storyboardSeeds.length);
  const removedSlotIds = new Set(current.removedSlotIds || []);
  const existingSlotsById = new Map(current.slots.map((slot) => [slot.id, slot]));
  const naturalOrder = new Map<string, number>();

  const nextStoryboardSlots = storyboardSeeds.flatMap((seed, index) => {
    const slotId = `${episode?.id || 'episode'}-shot-${index + 1}`;
    if (removedSlotIds.has(slotId)) {
      return [];
    }

    const existing = existingSlotsById.get(slotId);
    const summary = seed.summary;
    const shotCount = estimateShotCount(summary, index);
    naturalOrder.set(slotId, naturalOrder.size);

    return [{
      id: slotId,
      source: 'storyboard' as const,
      title: existing?.title || seed.title || `镜头${index + 1}`,
      summary,
      promptText: existing?.promptText || seed.promptText || promptSegments[index] || summary,
      order: existing?.order ?? index,
      durationLabel: existing?.durationLabel || seed.durationLabel || formatShotDurationLabel(Math.max(3, Math.min(shotCount, 10))),
      recommendedModelId: existing?.recommendedModelId || seed.recommendedModelId || '',
      recommendedModeId: existing?.recommendedModeId || seed.recommendedModeId || '',
      referenceAssetNames: existing?.referenceAssetNames || seed.referenceAssetNames || [],
      clip: existing?.clip || null,
      job: existing?.job || null,
    }];
  });

  const manualSlots = current.slots
    .filter((slot) => slot.source === 'manual')
    .map((slot) => {
      naturalOrder.set(slot.id, naturalOrder.size);
      return {
        ...slot,
        job: slot.job || null,
      };
    });

  const slots = [...nextStoryboardSlots, ...manualSlots]
    .sort((left, right) => {
      const leftOrder = existingSlotsById.get(left.id)?.order;
      const rightOrder = existingSlotsById.get(right.id)?.order;

      if (leftOrder !== undefined && rightOrder !== undefined && leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      if (leftOrder !== undefined && rightOrder === undefined) {
        return -1;
      }
      if (leftOrder === undefined && rightOrder !== undefined) {
        return 1;
      }
      return (naturalOrder.get(left.id) || 0) - (naturalOrder.get(right.id) || 0);
    })
    .map((slot, index) => ({
      ...slot,
      order: index,
    }));

  const selectedShotId = current.selectedShotId && slots.some((slot) => slot.id === current.selectedShotId)
    ? current.selectedShotId
    : slots[0]?.id || null;

  return {
    selectedShotId,
    slots: withShotTimeline(slots),
    removedSlotIds: current.removedSlotIds,
  };
}

export function appendManualEpisodeShotSlot(strip: EpisodeShotStrip | null | undefined): EpisodeShotStrip {
  const current = normalizeEpisodeShotStrip(strip);
  const manualCount = current.slots.filter((slot) => slot.source === 'manual').length;
  const nextSlot: EpisodeShotSlot = {
    id: `manual-shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'manual',
    title: `补充镜头${manualCount + 1}`,
    summary: '手动补充的分镜片段。',
    promptText: '',
    order: current.slots.length,
    durationLabel: formatShotDurationLabel(5),
    clip: null,
    job: null,
  };

  return {
    selectedShotId: nextSlot.id,
    slots: withShotTimeline([...current.slots, nextSlot]),
    removedSlotIds: current.removedSlotIds,
  };
}

export function selectEpisodeShotSlot(strip: EpisodeShotStrip | null | undefined, slotId: string): EpisodeShotStrip {
  const current = normalizeEpisodeShotStrip(strip);
  if (!current.slots.some((slot) => slot.id === slotId)) {
    return current;
  }

  return {
    ...current,
    selectedShotId: slotId,
  };
}

export function findSelectedEpisodeShot(strip: EpisodeShotStrip | null | undefined): EpisodeShotSlot | null {
  const current = normalizeEpisodeShotStrip(strip);
  return current.slots.find((slot) => slot.id === current.selectedShotId) || null;
}

export function clearEpisodeShotClip(
  strip: EpisodeShotStrip | null | undefined,
  targetShotId?: string | null,
): EpisodeShotStrip {
  const current = normalizeEpisodeShotStrip(strip);
  const resolvedShotId = targetShotId || current.selectedShotId;
  if (!resolvedShotId) {
    return current;
  }

  return {
    ...current,
    slots: withShotTimeline(current.slots.map((slot) => (
      slot.id === resolvedShotId
        ? {
            ...slot,
            clip: null,
          }
        : slot
    ))),
  };
}

export function saveClipToEpisodeShotStrip(params: {
  strip: EpisodeShotStrip | null | undefined;
  clip: EpisodeShotClip;
  targetShotId?: string | null;
}): EpisodeShotStrip {
  const { clip, targetShotId } = params;
  const current = normalizeEpisodeShotStrip(params.strip);
  const resolvedShotId = targetShotId || current.selectedShotId;
  if (!resolvedShotId) {
    return current;
  }

  return {
    selectedShotId: resolvedShotId,
    slots: withShotTimeline(current.slots.map((slot) => (
      slot.id === resolvedShotId
        ? {
            ...slot,
            clip,
            job: null,
          }
        : slot
    ))),
    removedSlotIds: current.removedSlotIds,
  };
}

export function renameEpisodeShotSlot(
  strip: EpisodeShotStrip | null | undefined,
  slotId: string,
  title: string,
): EpisodeShotStrip {
  const current = normalizeEpisodeShotStrip(strip);
  const nextTitle = String(title || '').trim();
  if (!nextTitle) {
    return current;
  }

  return {
    ...current,
    slots: withShotTimeline(current.slots.map((slot) => (
      slot.id === slotId
        ? {
            ...slot,
            title: nextTitle,
          }
        : slot
    ))),
  };
}

export function deleteEpisodeShotSlot(
  strip: EpisodeShotStrip | null | undefined,
  slotId: string,
): EpisodeShotStrip {
  const current = normalizeEpisodeShotStrip(strip);
  const targetIndex = current.slots.findIndex((slot) => slot.id === slotId);
  if (targetIndex < 0) {
    return current;
  }

  const target = current.slots[targetIndex];
  const nextSlots = current.slots
    .filter((slot) => slot.id !== slotId)
    .map((slot, index) => ({
      ...slot,
      order: index,
    }));
  const nextSelectedShotId = current.selectedShotId === slotId
    ? nextSlots[Math.max(0, targetIndex - 1)]?.id || nextSlots[0]?.id || null
    : current.selectedShotId;

  return {
    selectedShotId: nextSelectedShotId,
    slots: withShotTimeline(nextSlots),
    removedSlotIds: target.source === 'storyboard'
      ? Array.from(new Set([...(current.removedSlotIds || []), target.id]))
      : current.removedSlotIds,
  };
}

export function reorderEpisodeShotSlot(params: {
  strip: EpisodeShotStrip | null | undefined;
  fromShotId: string;
  toShotId?: string | null;
}): EpisodeShotStrip {
  const current = normalizeEpisodeShotStrip(params.strip);
  const fromIndex = current.slots.findIndex((slot) => slot.id === params.fromShotId);
  if (fromIndex < 0) {
    return current;
  }

  const nextSlots = [...current.slots];
  const [movedSlot] = nextSlots.splice(fromIndex, 1);
  const targetIndex = params.toShotId
    ? nextSlots.findIndex((slot) => slot.id === params.toShotId)
    : nextSlots.length;
  nextSlots.splice(targetIndex >= 0 ? targetIndex : nextSlots.length, 0, movedSlot);

  return {
    ...current,
    slots: withShotTimeline(nextSlots.map((slot, index) => ({
      ...slot,
      order: index,
    }))),
  };
}

export function upsertEpisodeShotJob(params: {
  strip: EpisodeShotStrip | null | undefined;
  targetShotId?: string | null;
  job: EpisodeShotJob;
}): EpisodeShotStrip {
  const current = normalizeEpisodeShotStrip(params.strip);
  const resolvedShotId = params.targetShotId || current.selectedShotId;
  if (!resolvedShotId) {
    return current;
  }

  return {
    ...current,
    slots: withShotTimeline(current.slots.map((slot) => (
      slot.id === resolvedShotId
        ? {
            ...slot,
            job: params.job,
          }
        : slot
    ))),
  };
}

export function clearEpisodeShotJob(
  strip: EpisodeShotStrip | null | undefined,
  targetShotId?: string | null,
): EpisodeShotStrip {
  const current = normalizeEpisodeShotStrip(strip);
  const resolvedShotId = targetShotId || current.selectedShotId;
  if (!resolvedShotId) {
    return current;
  }

  return {
    ...current,
    slots: withShotTimeline(current.slots.map((slot) => (
      slot.id === resolvedShotId
        ? {
            ...slot,
            job: null,
          }
        : slot
    ))),
  };
}

export function parseShotDurationSeconds(value?: string | null) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return 0;
  }

  const minuteSecondMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (minuteSecondMatch) {
    return (Number(minuteSecondMatch[1]) * 60) + Number(minuteSecondMatch[2]);
  }

  const secondSuffixMatch = normalized.match(/^(\d{1,3})(?:\s*s|\s*sec|\s*secs|\s*seconds?)$/i);
  if (secondSuffixMatch) {
    return Number(secondSuffixMatch[1]);
  }

  const plainNumberMatch = normalized.match(/^(\d{1,3})$/);
  if (plainNumberMatch) {
    return Number(plainNumberMatch[1]);
  }

  return 0;
}

export function summarizeEpisodeShotStrip(strip: EpisodeShotStrip | null | undefined) {
  const current = normalizeEpisodeShotStrip(strip);
  const completedSlots = current.slots.filter((slot) => Boolean(slot.clip?.videoUrl));
  const totalSeconds = completedSlots.reduce((sum, slot) => sum + parseShotDurationSeconds(slot.clip?.durationLabel || slot.durationLabel), 0);

  return {
    totalSlots: current.slots.length,
    completedSlots: completedSlots.length,
    totalSeconds,
  };
}

export function getEpisodeShotStripTotalSeconds(strip: EpisodeShotStrip | null | undefined) {
  const current = normalizeEpisodeShotStrip(strip);
  return current.slots[current.slots.length - 1]?.endSeconds || 0;
}

export function buildEpisodeShotClip(params: {
  slot: EpisodeShotSlot;
  node: CanvasNode;
  videoUrl: string;
  fallbackPromptText?: string;
}): EpisodeShotClip {
  return {
    videoUrl: params.videoUrl,
    sourceNodeId: params.node.id,
    savedAt: new Date().toISOString(),
    modelId: String(params.node.modelId || '').trim(),
    promptText: params.slot.promptText || params.fallbackPromptText || '',
    durationLabel: params.slot.durationLabel,
    thumbnailUrl: params.videoUrl,
  };
}
