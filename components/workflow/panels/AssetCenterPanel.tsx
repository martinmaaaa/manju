import React, { useMemo, useState } from 'react';
import { GitBranchPlus, Package2, Plus, Shapes, Sparkles, Users } from 'lucide-react';
import type {
  WorkflowAsset,
  WorkflowAssetBatchTemplate,
  WorkflowAssetBatchTemplateTarget,
  WorkflowAssetType,
  WorkflowAssetVersion,
} from '../../../services/workflow/domain/types';

interface AssetCenterPanelProps {
  assets: WorkflowAsset[];
  assetVersions: WorkflowAssetVersion[];
  seriesTitle?: string;
  canAutoAttachSuggestedTemplates: boolean;
  assetBatchTemplates: WorkflowAssetBatchTemplate[];
  assetBatchTargetsByAssetId: Record<string, WorkflowAssetBatchTemplateTarget[]>;
  onCreateAsset: (
    type: WorkflowAssetType,
    name: string,
    tags: string[],
    autoApplySuggestedTemplates?: boolean,
  ) => Promise<{
    assetId: string;
    assetName: string;
    appliedTemplateNames: string[];
    suggestedTargets: WorkflowAssetBatchTemplateTarget[];
  } | void> | void;
  onCreateAssetVersion: (assetId: string, notes?: string) => void;
  onApplyAssetBatchTemplateTarget: (assetId: string, target: WorkflowAssetBatchTemplateTarget) => void;
}

interface AssetCreationFeedback {
  assetId: string;
  assetName: string;
  appliedTemplateNames: string[];
  suggestedTargets: WorkflowAssetBatchTemplateTarget[];
}

const assetTypeOptions: Array<{
  value: WorkflowAssetType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 'character', label: '人物', icon: Users },
  { value: 'scene', label: '场景', icon: Shapes },
  { value: 'prop', label: '道具', icon: Package2 },
  { value: 'style', label: '风格', icon: Sparkles },
];

const typeLabels: Record<WorkflowAssetType, string> = {
  character: '人物',
  scene: '场景',
  prop: '道具',
  style: '风格',
};

export const AssetCenterPanel: React.FC<AssetCenterPanelProps> = ({
  assets,
  assetVersions,
  seriesTitle,
  canAutoAttachSuggestedTemplates,
  assetBatchTemplates,
  assetBatchTargetsByAssetId,
  onCreateAsset,
  onCreateAssetVersion,
  onApplyAssetBatchTemplateTarget,
}) => {
  const [type, setType] = useState<WorkflowAssetType>('character');
  const [name, setName] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [autoAttachSuggestedTemplates, setAutoAttachSuggestedTemplates] = useState(true);
  const [isCreatingAsset, setIsCreatingAsset] = useState(false);
  const [recentlyCreatedAssetId, setRecentlyCreatedAssetId] = useState<string | null>(null);
  const [creationFeedback, setCreationFeedback] = useState<AssetCreationFeedback | null>(null);
  const [versionNotes, setVersionNotes] = useState<Record<string, string>>({});

  const groupedAssets = useMemo(() => assetTypeOptions.map(option => ({
    ...option,
    items: assets.filter(asset => asset.type === option.value),
  })), [assets]);

  const versionCountByAssetId = useMemo(() => assetVersions.reduce<Record<string, number>>((accumulator, version) => {
    accumulator[version.assetId] = (accumulator[version.assetId] ?? 0) + 1;
    return accumulator;
  }, {}), [assetVersions]);

  const latestVersionByAssetId = useMemo(() => assetVersions.reduce<Record<string, WorkflowAssetVersion>>((accumulator, version) => {
    const existing = accumulator[version.assetId];
    if (!existing || version.version > existing.version) {
      accumulator[version.assetId] = version;
    }
    return accumulator;
  }, {}), [assetVersions]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || isCreatingAsset) return;

    const tags = Array.from(new Set(
      tagsInput
        .split(/[，,、]/)
        .map(item => item.trim())
        .filter(Boolean),
    ));

    setIsCreatingAsset(true);

    try {
      const result = await Promise.resolve(
        onCreateAsset(
          type,
          trimmedName,
          tags,
          canAutoAttachSuggestedTemplates && autoAttachSuggestedTemplates,
        ),
      );

      if (result) {
        const appliedNames = Array.from(new Set(result.appliedTemplateNames));
        setRecentlyCreatedAssetId(result.assetId);
        setCreationFeedback({
          assetId: result.assetId,
          assetName: result.assetName,
          appliedTemplateNames: appliedNames,
          suggestedTargets: result.suggestedTargets.filter(target => !appliedNames.includes(target.name)),
        });
      } else {
        setRecentlyCreatedAssetId(null);
        setCreationFeedback(null);
      }

      setName('');
      setTagsInput('');
    } finally {
      setIsCreatingAsset(false);
    }
  };

  const handleApplyCreationSuggestion = (target: WorkflowAssetBatchTemplateTarget) => {
    if (!creationFeedback) return;

    onApplyAssetBatchTemplateTarget(creationFeedback.assetId, target);
    setCreationFeedback(current => {
      if (!current || current.assetId !== creationFeedback.assetId) {
        return current;
      }

      return {
        ...current,
        appliedTemplateNames: current.appliedTemplateNames.includes(target.name)
          ? current.appliedTemplateNames
          : [...current.appliedTemplateNames, target.name],
        suggestedTargets: current.suggestedTargets.filter(item => item.key !== target.key),
      };
    });
  };

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
      <div className="text-xs uppercase tracking-[0.22em] text-white/45">资产中心</div>
      <p className="mt-3 text-sm leading-7 text-slate-300">
        系列级资产在这里沉淀并滚动出版本。单集工作流只做绑定与复用，不再重复复制人物、场景和道具。
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {assetTypeOptions.map((option) => {
            const Icon = option.icon;
            const selected = option.value === type;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setType(option.value)}
                className={`flex items-center gap-2 rounded-2xl border px-3 py-3 text-sm transition ${
                  selected
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100'
                    : 'border-white/10 bg-black/20 text-slate-300 hover:border-white/20 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {option.label}
              </button>
            );
          })}
        </div>

        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={`添加${typeLabels[type]}资产名称`}
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-500/40"
        />
        <input
          value={tagsInput}
          onChange={(event) => setTagsInput(event.target.value)}
          placeholder="标签（逗号分隔）"
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-500/40"
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setAutoAttachSuggestedTemplates(current => !current)}
            disabled={!canAutoAttachSuggestedTemplates}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs transition ${
              canAutoAttachSuggestedTemplates && autoAttachSuggestedTemplates
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                : 'border-white/10 bg-white/5 text-slate-300'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            创建后自动加入推荐模板
          </button>

          <button
            type="submit"
            disabled={isCreatingAsset}
            className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={15} />
            {isCreatingAsset ? '创建中...' : '新增资产'}
          </button>
        </div>

        {!canAutoAttachSuggestedTemplates && (
          <div className="text-xs text-slate-500">先创建一个系列工作流，再启用自动挂入推荐模板。</div>
        )}
      </form>

      {creationFeedback && (
        <div className="mt-4 rounded-[22px] border border-cyan-500/20 bg-cyan-500/10 p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="rounded-2xl bg-cyan-500/15 p-2 text-cyan-100">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-cyan-50">已创建资产：{creationFeedback.assetName}</div>
              {creationFeedback.appliedTemplateNames.length > 0 ? (
                <div className="mt-1 text-xs text-cyan-100/90">
                  已自动加入：{creationFeedback.appliedTemplateNames.join(' / ')}
                </div>
              ) : creationFeedback.suggestedTargets.length > 0 ? (
                <div className="mt-1 text-xs text-cyan-100/90">
                  检测到可复用模板，建议顺手归入系列模板，后续新单集会更省事。
                </div>
              ) : (
                <div className="mt-1 text-xs text-cyan-100/90">
                  当前没有命中模板推荐，你也可以稍后在下方资产卡片中手动归组。
                </div>
              )}
            </div>
          </div>

          {creationFeedback.suggestedTargets.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-cyan-100/80">推荐操作</span>
              {creationFeedback.suggestedTargets.map(target => (
                <button
                  key={`${creationFeedback.assetId}-${target.key}`}
                  type="button"
                  onClick={() => handleApplyCreationSuggestion(target)}
                  className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] text-white transition hover:bg-white/15"
                  title={target.reason}
                >
                  {target.templateId ? `加入 ${target.name}` : `创建 ${target.name}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 space-y-4">
        {groupedAssets.map((group) => {
          const Icon = group.icon;

          return (
            <div key={group.value} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-white">
                  <Icon className="h-4 w-4 text-cyan-200" />
                  <span className="text-sm font-medium">{group.label}</span>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
                  {group.items.length}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {group.items.length === 0 ? (
                  <span className="text-xs text-slate-500">暂无资产</span>
                ) : (
                  group.items.map(asset => {
                    const latestVersion = latestVersionByAssetId[asset.id];
                    const latestNote = typeof latestVersion?.metadata.notes === 'string' ? latestVersion.metadata.notes : '';
                    const joinedTemplates = assetBatchTemplates.filter(template => template.assetIds.includes(asset.id));
                    const suggestedTargets = assetBatchTargetsByAssetId[asset.id] ?? [];
                    const isRecentlyCreated = asset.id === recentlyCreatedAssetId;

                    return (
                      <div
                        key={asset.id}
                        className={`rounded-[18px] border bg-white/[0.03] p-4 ${
                          isRecentlyCreated
                            ? 'border-cyan-500/30 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]'
                            : 'border-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-white">{asset.name}</div>
                            <div className="mt-1 text-xs text-slate-400">
                              v{latestVersion?.version ?? 1} · 共 {versionCountByAssetId[asset.id] ?? 1} 个版本
                              {asset.tags.length > 0 ? ` · ${asset.tags.join(' / ')}` : ''}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onCreateAssetVersion(asset.id, versionNotes[asset.id]);
                              setVersionNotes(current => ({ ...current, [asset.id]: '' }));
                            }}
                            className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100 transition hover:bg-cyan-500/20"
                          >
                            <GitBranchPlus size={14} />
                            新版本
                          </button>
                        </div>

                        {isRecentlyCreated && (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-100">
                              刚创建
                            </span>
                            {creationFeedback?.assetId === asset.id && creationFeedback.appliedTemplateNames.length > 0 && (
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-100">
                                已加入：{creationFeedback.appliedTemplateNames.join(' / ')}
                              </span>
                            )}
                          </div>
                        )}

                        {(joinedTemplates.length > 0 || suggestedTargets.length > 0) && (
                          <div className="mt-3 space-y-2">
                            {joinedTemplates.length > 0 && (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] text-slate-500">{seriesTitle ? `${seriesTitle} 模板` : '已加入模板'}</span>
                                {joinedTemplates.map(template => (
                                  <span
                                    key={`${asset.id}-${template.id}`}
                                    className={`rounded-full border px-3 py-1 text-[11px] ${
                                      template.autoApplyToNewEpisodes
                                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
                                        : 'border-white/10 bg-black/20 text-slate-300'
                                    }`}
                                  >
                                    {template.name}
                                  </span>
                                ))}
                              </div>
                            )}

                            {suggestedTargets.length > 0 && (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] text-slate-500">推荐操作</span>
                                {suggestedTargets.map(target => (
                                  <button
                                    key={`${asset.id}-${target.key}`}
                                    type="button"
                                    onClick={() => onApplyAssetBatchTemplateTarget(asset.id, target)}
                                    className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-100 transition hover:bg-cyan-500/20"
                                    title={target.reason}
                                  >
                                    {target.templateId ? `加入 ${target.name}` : `创建 ${target.name}`}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <input
                          value={versionNotes[asset.id] ?? ''}
                          onChange={(event) => setVersionNotes(current => ({ ...current, [asset.id]: event.target.value }))}
                          placeholder={latestNote || '版本备注（例如：冬装版、受伤版、夜景版）'}
                          className="mt-3 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-500/40"
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
