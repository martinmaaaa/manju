import React, { useMemo, useState } from 'react';
import {
  GitBranchPlus,
  Package2,
  Plus,
  Shapes,
  Sparkles,
  Users,
} from 'lucide-react';
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
  onApplyAssetBatchTemplateTarget: (
    assetId: string,
    target: WorkflowAssetBatchTemplateTarget,
  ) => void;
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

  const groupedAssets = useMemo(
    () =>
      assetTypeOptions.map((option) => ({
        ...option,
        items: assets.filter((asset) => asset.type === option.value),
      })),
    [assets],
  );

  const versionCountByAssetId = useMemo(
    () =>
      assetVersions.reduce<Record<string, number>>((accumulator, version) => {
        accumulator[version.assetId] = (accumulator[version.assetId] ?? 0) + 1;
        return accumulator;
      }, {}),
    [assetVersions],
  );

  const latestVersionByAssetId = useMemo(
    () =>
      assetVersions.reduce<Record<string, WorkflowAssetVersion>>((accumulator, version) => {
        const existing = accumulator[version.assetId];
        if (!existing || version.version > existing.version) {
          accumulator[version.assetId] = version;
        }
        return accumulator;
      }, {}),
    [assetVersions],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName || isCreatingAsset) return;

    const tags = Array.from(
      new Set(
        tagsInput
          .split(/[,\uFF0C\u3001\n]+/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );

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
        const appliedTemplateNames = Array.from(new Set(result.appliedTemplateNames));
        setRecentlyCreatedAssetId(result.assetId);
        setCreationFeedback({
          assetId: result.assetId,
          assetName: result.assetName,
          appliedTemplateNames,
          suggestedTargets: result.suggestedTargets.filter(
            (target) => !appliedTemplateNames.includes(target.name),
          ),
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
    setCreationFeedback((current) => {
      if (!current || current.assetId !== creationFeedback.assetId) {
        return current;
      }

      return {
        ...current,
        appliedTemplateNames: current.appliedTemplateNames.includes(target.name)
          ? current.appliedTemplateNames
          : [...current.appliedTemplateNames, target.name],
        suggestedTargets: current.suggestedTargets.filter((item) => item.key !== target.key),
      };
    });
  };

  return (
    <section className="tianti-surface rounded-[28px] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-white/45">Asset Center</div>
          <h3 className="mt-2 text-xl font-semibold text-white">资产中心</h3>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            在这里沉淀系列级可复用资产。单集工作流只负责绑定与调用，不再重复复制人物、
            场景和道具。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="tianti-chip is-accent">
            资产总量 {assets.length}
          </span>
          <span className="tianti-chip">
            模板 {assetBatchTemplates.length}
          </span>
          {seriesTitle && <span className="tianti-chip">{seriesTitle}</span>}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_0.95fr]">
        <form
          onSubmit={handleSubmit}
          className="tianti-surface-muted rounded-[26px] p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-white">创建新资产</div>
              <div className="mt-1 text-xs leading-6 text-slate-400">
                先沉淀稳定资产，再通过模板批量复用到长剧的多个单集。
              </div>
            </div>
            <button
              type="submit"
              disabled={isCreatingAsset}
              className="tianti-button tianti-button-primary px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={15} />
              {isCreatingAsset ? '创建中...' : '新增资产'}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {assetTypeOptions.map((option) => {
              const Icon = option.icon;
              const selected = option.value === type;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setType(option.value)}
                  className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm transition ${
                    selected
                      ? 'border-cyan-500/35 bg-cyan-500/12 text-cyan-100'
                      : 'border-white/10 bg-black/20 text-slate-300 hover:border-white/20 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`例如：主角 ${typeLabels[type]} A / 常驻场景 01`}
              className="tianti-input w-full px-4 py-3 text-sm"
            />
            <input
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="标签可用逗号分隔，例如：主角, 常驻, 夜景"
              className="tianti-input w-full px-4 py-3 text-sm"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setAutoAttachSuggestedTemplates((current) => !current)}
              disabled={!canAutoAttachSuggestedTemplates}
              className={`tianti-chip transition ${
                canAutoAttachSuggestedTemplates && autoAttachSuggestedTemplates
                  ? 'is-success'
                  : ''
              } disabled:cursor-not-allowed disabled:opacity-40`}
            >
              自动加入推荐模板
            </button>
            {!canAutoAttachSuggestedTemplates && (
              <span className="text-xs text-slate-500">
                先创建系列工作流，再启用自动加入模板。
              </span>
            )}
          </div>

          <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 px-4 py-4 text-sm leading-7 text-slate-300">
            推荐做法：先把人物、常驻场景、核心道具沉淀成模板，再让新单集自动继承，避免 80
            集长线项目里重复绑定。
          </div>
        </form>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          {groupedAssets.map((group) => {
            const Icon = group.icon;

            return (
              <div key={group.value} className="tianti-stat-card px-5 py-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-white">
                    <Icon className="h-4 w-4 text-cyan-200" />
                    <span className="text-sm font-medium">{group.label}</span>
                  </div>
                  <span className="tianti-chip">{group.items.length}</span>
                </div>
                <div className="mt-3 text-sm text-slate-400">
                  {group.items.length === 0
                    ? `当前还没有${group.label}资产。`
                    : `已沉淀 ${group.items.length} 个${group.label}资产，可继续滚动出版本。`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {creationFeedback && (
        <div className="mt-5 rounded-[24px] border border-cyan-400/20 bg-cyan-400/10 p-5">
          <div className="flex flex-wrap items-start gap-3">
            <div className="rounded-2xl bg-cyan-400/15 p-2 text-cyan-100">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-cyan-50">
                已创建资产：{creationFeedback.assetName}
              </div>
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
            <div className="mt-4 flex flex-wrap gap-2">
              {creationFeedback.suggestedTargets.map((target) => (
                <button
                  key={`${creationFeedback.assetId}-${target.key}`}
                  type="button"
                  onClick={() => handleApplyCreationSuggestion(target)}
                  className="tianti-button tianti-button-secondary px-3 py-1.5 text-xs"
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
            <section key={group.value} className="tianti-surface-muted rounded-[26px] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-white">
                  <Icon className="h-4 w-4 text-cyan-200" />
                  <span className="text-sm font-medium">{group.label}</span>
                </div>
                <span className="tianti-chip">{group.items.length}</span>
              </div>

              <div className="mt-4 space-y-3">
                {group.items.length === 0 ? (
                  <div className="rounded-[20px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-slate-500">
                    暂无 {group.label} 资产。
                  </div>
                ) : (
                  group.items.map((asset) => {
                    const latestVersion = latestVersionByAssetId[asset.id];
                    const latestNote =
                      typeof latestVersion?.metadata?.notes === 'string'
                        ? latestVersion.metadata.notes
                        : '';
                    const joinedTemplates = assetBatchTemplates.filter((template) =>
                      template.assetIds.includes(asset.id),
                    );
                    const suggestedTargets = assetBatchTargetsByAssetId[asset.id] ?? [];
                    const isRecentlyCreated = asset.id === recentlyCreatedAssetId;

                    return (
                      <article
                        key={asset.id}
                        className={`tianti-surface rounded-[22px] p-4 ${
                          isRecentlyCreated ? 'border-cyan-400/25 shadow-[0_0_0_1px_rgba(73,200,255,0.1)]' : ''
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-white">{asset.name}</div>
                            <div className="mt-1 text-xs text-slate-400">
                              v{latestVersion?.version ?? 1} · 共 {versionCountByAssetId[asset.id] ?? 1} 个版本
                              {asset.tags.length > 0 ? ` · ${asset.tags.join(' / ')}` : ''}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onCreateAssetVersion(asset.id, versionNotes[asset.id]);
                              setVersionNotes((current) => ({ ...current, [asset.id]: '' }));
                            }}
                            className="tianti-button tianti-button-ghost px-3 py-1.5 text-xs"
                          >
                            <GitBranchPlus size={14} />
                            新版本
                          </button>
                        </div>

                        {isRecentlyCreated && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="tianti-chip is-accent">刚创建</span>
                            {creationFeedback?.assetId === asset.id &&
                              creationFeedback.appliedTemplateNames.length > 0 && (
                                <span className="tianti-chip is-success">
                                  已加入：{creationFeedback.appliedTemplateNames.join(' / ')}
                                </span>
                              )}
                          </div>
                        )}

                        {(joinedTemplates.length > 0 || suggestedTargets.length > 0) && (
                          <div className="mt-4 space-y-3">
                            {joinedTemplates.length > 0 && (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[11px] text-slate-500">
                                  {seriesTitle ? `${seriesTitle} 模板` : '已加入模板'}
                                </span>
                                {joinedTemplates.map((template) => (
                                  <span
                                    key={`${asset.id}-${template.id}`}
                                    className={`tianti-chip ${
                                      template.autoApplyToNewEpisodes ? 'is-success' : ''
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
                                {suggestedTargets.map((target) => (
                                  <button
                                    key={`${asset.id}-${target.key}`}
                                    type="button"
                                    onClick={() => onApplyAssetBatchTemplateTarget(asset.id, target)}
                                    className="tianti-button tianti-button-secondary px-3 py-1.5 text-xs"
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
                          onChange={(event) =>
                            setVersionNotes((current) => ({
                              ...current,
                              [asset.id]: event.target.value,
                            }))
                          }
                          placeholder={
                            latestNote || '版本备注，例如：冬装版、受伤版、夜景版'
                          }
                          className="tianti-input mt-4 w-full px-4 py-3 text-sm"
                        />
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
};
