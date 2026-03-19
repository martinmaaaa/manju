import React from 'react';
import { ChevronRight, X } from 'lucide-react';
import type { AssetVersion, CanonicalAsset } from '../../../types/workflowApp';
import { Card, MetricTile } from '../PagePrimitives';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function fmt(value?: string | null) {
  if (!value) return '暂无时间';
  return new Date(value).toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function currentAssetVersion(asset: CanonicalAsset): AssetVersion | null {
  return asset.versions.find((item) => item.id === asset.currentVersionId) || asset.versions[0] || null;
}

interface AssetFormState {
  type: 'character' | 'scene' | 'prop' | 'style';
  name: string;
  description: string;
  promptText: string;
}

interface AssetsPageProps {
  assets: CanonicalAsset[];
  assetFilterType: 'character' | 'scene' | 'prop' | 'style';
  assetSearchQuery: string;
  expandedAssetId: string | null;
  assetVersionDrawerAssetId: string | null;
  assetVersionCompareIds: Record<string, { leftId: string | null; rightId: string | null }>;
  assetVersionSwitchId: string | null;
  assetExtractRunning: boolean;
  assetCreating: boolean;
  assetForm: AssetFormState;
  formatAssetTypeLabel: (type: string) => string;
  resolveAssetPromptText: (asset: CanonicalAsset) => string;
  assetPreview: (asset: CanonicalAsset) => string;
  assetCapability: (asset: CanonicalAsset) => string | null;
  assetVersionSourceLabel: (version: AssetVersion) => string;
  onFilterTypeChange: (type: 'character' | 'scene' | 'prop' | 'style') => void;
  onSearchQueryChange: (value: string) => void;
  onSelectAsset: (assetId: string) => void;
  onGoEpisodes: () => void;
  onRunAssetExtract: () => void | Promise<void>;
  onGeneratePreview: (asset: CanonicalAsset) => void | Promise<void>;
  onToggleLock: (asset: CanonicalAsset) => void | Promise<void>;
  onToggleVersions: (asset: CanonicalAsset) => void;
  onCloseVersionDrawer: () => void;
  onSetCompareSlot: (assetId: string, slot: 'leftId' | 'rightId', versionId: string) => void;
  onSetCurrentVersion: (asset: CanonicalAsset, versionId: string) => void | Promise<void>;
  onAssetFormChange: (patch: Partial<AssetFormState>) => void;
  onCreateAsset: () => void | Promise<void>;
}

export function AssetsPage({
  assets,
  assetFilterType,
  assetSearchQuery,
  expandedAssetId,
  assetVersionDrawerAssetId,
  assetVersionCompareIds,
  assetVersionSwitchId,
  assetExtractRunning,
  assetCreating,
  assetForm,
  formatAssetTypeLabel,
  resolveAssetPromptText,
  assetPreview,
  assetCapability,
  assetVersionSourceLabel,
  onFilterTypeChange,
  onSearchQueryChange,
  onSelectAsset,
  onGoEpisodes,
  onRunAssetExtract,
  onGeneratePreview,
  onToggleLock,
  onToggleVersions,
  onCloseVersionDrawer,
  onSetCompareSlot,
  onSetCurrentVersion,
  onAssetFormChange,
  onCreateAsset,
}: AssetsPageProps) {
  const filteredAssets = assets.filter((asset) => {
    if (asset.type !== assetFilterType) {
      return false;
    }
    const query = assetSearchQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return [asset.name, asset.description, resolveAssetPromptText(asset)]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  const activeAsset = filteredAssets.find((asset) => asset.id === expandedAssetId) || filteredAssets[0] || null;
  const activeAssetVersion = activeAsset ? currentAssetVersion(activeAsset) : null;
  const drawerAsset = assets.find((asset) => asset.id === assetVersionDrawerAssetId) || null;
  const drawerVersions = drawerAsset ? [...drawerAsset.versions].sort((left, right) => right.versionNumber - left.versionNumber) : [];
  const drawerCurrentVersion = drawerAsset ? currentAssetVersion(drawerAsset) : null;
  const drawerCompareState = drawerAsset
    ? (assetVersionCompareIds[drawerAsset.id] || {
      leftId: drawerCurrentVersion?.id || null,
      rightId: drawerVersions.find((item) => item.id !== drawerCurrentVersion?.id)?.id || drawerCurrentVersion?.id || null,
    })
    : null;
  const drawerLeftVersion = drawerAsset?.versions.find((item) => item.id === drawerCompareState?.leftId) || null;
  const drawerRightVersion = drawerAsset?.versions.find((item) => item.id === drawerCompareState?.rightId) || null;

  const renderAssetVersionCompareCard = (
    title: string,
    version: AssetVersion | null,
    currentVersionId: string | null,
  ) => {
    if (!version) {
      return (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/45">
          未选择版本。
        </div>
      );
    }

    const isCurrent = version.id === currentVersionId;
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-white/35">{title}</div>
            <div className="mt-2 text-sm font-semibold text-white">V{version.versionNumber}</div>
          </div>
          {isCurrent ? (
            <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100">
              当前版本
            </div>
          ) : null}
        </div>
        <div className="mt-3 text-xs leading-6 text-white/45">
          <div>{fmt(version.createdAt)}</div>
          <div>{assetVersionSourceLabel(version) || '手动'}</div>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          {version.previewUrl ? (
            <img src={version.previewUrl} alt={`Version ${version.versionNumber}`} className="h-48 w-full object-cover" />
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-white/35">暂无预览图</div>
          )}
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-7 text-slate-300">
          {version.promptText || '暂无提示词。'}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card
        eyebrow="流程二"
        title="资产生产"
        action={(
          <button
            type="button"
            disabled={assetExtractRunning}
            onClick={() => void onRunAssetExtract()}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {assetExtractRunning ? '正在提取全部资产提示词...' : '一键提取全部资产提示词'}
          </button>
        )}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <MetricTile label="总资产数" value={assets.length} />
          <MetricTile label="已锁定资产" value={assets.filter((asset) => asset.isLocked).length} />
          <MetricTile label="当前分类" value={formatAssetTypeLabel(assetFilterType)} hint={filteredAssets.length ? `${filteredAssets.length} 个资产` : '当前分类还没有资产'} />
        </div>
        <div className="mt-5 rounded-[24px] border border-cyan-300/15 bg-cyan-300/[0.07] px-4 py-4 text-sm leading-7 text-cyan-100/80">
          资产页只负责把导演分析沉淀下来的角色、场景和道具统一生成成可锁定版本，然后把当前版本送入后面的剧集和工作台。
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {(['character', 'scene', 'prop', 'style'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onFilterTypeChange(type)}
              className={cx(
                'rounded-full px-4 py-2 text-sm',
                assetFilterType === type
                  ? 'bg-white text-black'
                  : 'border border-white/10 bg-white/[0.04] text-slate-100',
              )}
            >
              {formatAssetTypeLabel(type)}
            </button>
          ))}
          <input
            value={assetSearchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            className="min-w-[220px] rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white outline-none"
            placeholder="搜索资产"
          />
          <button
            type="button"
            onClick={onGoEpisodes}
            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
          >
            进入剧集
          </button>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <Card eyebrow="当前资产" title={activeAsset ? activeAsset.name : '等待资产'}>
          {activeAsset ? (
            <div className="space-y-5">
              <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
                <div className="overflow-hidden rounded-[24px] border border-white/10 bg-black/20">
                  {assetPreview(activeAsset) ? (
                    <img src={assetPreview(activeAsset)} alt={activeAsset.name} className="h-full min-h-[260px] w-full object-cover" />
                  ) : (
                    <div className="flex min-h-[260px] items-center justify-center text-sm text-white/35">暂无预览图</div>
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-slate-200">{formatAssetTypeLabel(activeAsset.type)}</span>
                    <span className={cx('rounded-full border px-3 py-1 text-xs', activeAsset.isLocked ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-slate-200')}>
                      {activeAsset.isLocked ? '已锁定' : '未锁定'}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200">
                      {activeAssetVersion ? `V${activeAssetVersion.versionNumber}` : '无版本'}
                    </span>
                  </div>
                  <div className="mt-4 text-sm leading-7 text-slate-300">{activeAsset.description || '暂无资产描述。'}</div>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-7 text-slate-300">
                    {resolveAssetPromptText(activeAsset) || '当前资产还没有沉淀提示词。'}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {assetCapability(activeAsset) ? (
                      <button
                        type="button"
                        onClick={() => void onGeneratePreview(activeAsset)}
                        className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
                      >
                        生成预览图
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void onToggleLock(activeAsset)}
                      className={cx('rounded-full px-4 py-2 text-sm', activeAsset.isLocked ? 'border border-white/10 bg-white/[0.04] text-slate-100' : 'bg-emerald-300 text-black')}
                    >
                      {activeAsset.isLocked ? '解除锁定' : '锁定资产'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleVersions(activeAsset)}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
                    >
                      {assetVersionDrawerAssetId === activeAsset.id ? '收起版本对比' : '查看版本对比'}
                    </button>
                  </div>
                </div>
              </div>

              <details className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <summary className="cursor-pointer text-sm font-semibold text-white">补充手工资产</summary>
                <form
                  className="mt-4 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void onCreateAsset();
                  }}
                >
                  <select value={assetForm.type} onChange={(event) => onAssetFormChange({ type: event.target.value as AssetFormState['type'] })} className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none">
                    {['character', 'scene', 'prop', 'style'].map((type) => <option key={type} value={type}>{formatAssetTypeLabel(type)}</option>)}
                  </select>
                  <input value={assetForm.name} onChange={(event) => onAssetFormChange({ name: event.target.value })} className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none" placeholder="资产名称" />
                  <textarea value={assetForm.description} onChange={(event) => onAssetFormChange({ description: event.target.value })} className="min-h-[120px] w-full rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none" placeholder="资产描述" />
                  <textarea value={assetForm.promptText} onChange={(event) => onAssetFormChange({ promptText: event.target.value })} className="min-h-[120px] w-full rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none" placeholder="手工补充提示词（可选）" />
                  <button disabled={assetCreating} className="w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60">{assetCreating ? '创建资产中...' : '补充手工资产'}</button>
                </form>
              </details>
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-14 text-sm text-slate-300">
              当前分类还没有资产。先运行统一资产提取，或手工补一条资产。
            </div>
          )}
        </Card>

        <Card eyebrow="资产库" title="当前分类资产">
          <div className="space-y-3">
            {filteredAssets.map((asset) => {
              const assetCurrentVersion = currentAssetVersion(asset);
              const previewUrl = assetPreview(asset);

              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onSelectAsset(asset.id)}
                  className={cx(
                    'flex w-full items-center gap-4 rounded-[24px] border p-3 text-left transition',
                    expandedAssetId === asset.id
                      ? 'border-cyan-300/30 bg-cyan-300/[0.08]'
                      : 'border-white/10 bg-white/[0.03] hover:border-cyan-300/20 hover:bg-white/[0.05]',
                  )}
                >
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[18px] border border-white/10 bg-black/20">
                    {previewUrl ? (
                      <img src={previewUrl} alt={asset.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[11px] text-white/35">暂无预览图</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">{formatAssetTypeLabel(asset.type)}</div>
                        <div className="mt-2 text-base font-semibold text-white">{asset.name}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={cx('rounded-full border px-3 py-1 text-[11px]', asset.isLocked ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-white/[0.04] text-slate-200')}>
                          {asset.isLocked ? '已锁定' : '未锁定'}
                        </div>
                        {expandedAssetId === asset.id ? (
                          <div className="rounded-full border border-cyan-300/25 bg-cyan-300/[0.12] px-3 py-1 text-[11px] text-cyan-100">
                            当前展开
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-300">
                      {asset.description || '暂无资产描述。'}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/45">
                      <span>版本 {asset.versions.length}</span>
                      <span>当前 {assetCurrentVersion ? `V${assetCurrentVersion.versionNumber}` : '无版本'}</span>
                      <span>更新于 {fmt(asset.updatedAt)}</span>
                    </div>
                    {expandedAssetId === asset.id ? (
                      <div className="mt-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-2 text-xs text-cyan-100/85">
                        当前资产已在左侧工作区展开，可在左侧查看预览、切换版本和锁定状态。
                      </div>
                    ) : null}
                  </div>
                  <ChevronRight size={18} className={cx('shrink-0 text-white/30 transition', expandedAssetId === asset.id && 'text-cyan-200')} />
                </button>
              );
            })}
            {filteredAssets.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-10 text-sm text-slate-300">
                当前分类没有匹配资产，换个分类或搜索条件试试。
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      {drawerAsset ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/55 backdrop-blur-sm">
          <button
            type="button"
            aria-label="关闭版本对比"
            onClick={onCloseVersionDrawer}
            className="absolute inset-0"
          />
          <div className="relative h-full w-full max-w-[860px] overflow-y-auto border-l border-white/10 bg-[#06090f] p-6 shadow-[-24px_0_80px_rgba(0,0,0,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/70">版本对比</div>
                <div className="mt-3 text-2xl font-semibold text-white">{drawerAsset.name}</div>
                <div className="mt-2 text-sm leading-7 text-slate-300">先对比提示词和预览图，再决定切换当前版本。</div>
              </div>
              <button
                type="button"
                onClick={onCloseVersionDrawer}
                className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-6 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">版本历史</div>
                  <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/55">
                    共 {drawerVersions.length} 个版本
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {drawerVersions.map((version) => {
                    const isCurrent = version.id === drawerAsset.currentVersionId;
                    const isCompareLeft = drawerCompareState?.leftId === version.id;
                    const isCompareRight = drawerCompareState?.rightId === version.id;

                    return (
                      <div
                        key={version.id}
                        className={cx(
                          'rounded-2xl border p-4 transition',
                          isCurrent ? 'border-emerald-300/25 bg-emerald-300/8' : 'border-white/10 bg-white/[0.03]',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">V{version.versionNumber}</div>
                            <div className="mt-1 text-xs text-white/45">
                              {fmt(version.createdAt)} · {assetVersionSourceLabel(version)}
                            </div>
                          </div>
                          {isCurrent ? (
                            <div className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100">
                              当前版本
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-3 line-clamp-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-slate-300">
                          {version.promptText || '暂无提示词。'}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => onSetCompareSlot(drawerAsset.id, 'leftId', version.id)} className={cx('rounded-full border px-3 py-1.5 text-xs', isCompareLeft ? 'border-cyan-300/30 bg-cyan-300/12 text-cyan-100' : 'border-white/10 bg-white/[0.04] text-slate-200')}>对比 A</button>
                          <button type="button" onClick={() => onSetCompareSlot(drawerAsset.id, 'rightId', version.id)} className={cx('rounded-full border px-3 py-1.5 text-xs', isCompareRight ? 'border-fuchsia-300/30 bg-fuchsia-300/12 text-fuchsia-100' : 'border-white/10 bg-white/[0.04] text-slate-200')}>对比 B</button>
                          <button
                            type="button"
                            disabled={isCurrent || assetVersionSwitchId === version.id}
                            onClick={() => void onSetCurrentVersion(drawerAsset, version.id)}
                            className={cx('rounded-full px-3 py-1.5 text-xs', isCurrent ? 'border border-white/10 bg-white/[0.04] text-white/45' : 'bg-white text-black')}
                          >
                            {assetVersionSwitchId === version.id ? '切换中...' : isCurrent ? '当前版本' : '设为当前'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-white/35">版本对照</div>
                <div className="mt-2 text-sm text-slate-300">把当前资产的不同版本放在一起检查风格偏移、提示词和当前预览。</div>
                <div className="mt-4 grid gap-4 2xl:grid-cols-2">
                  {renderAssetVersionCompareCard('对比 A', drawerLeftVersion, drawerAsset.currentVersionId)}
                  {renderAssetVersionCompareCard('对比 B', drawerRightVersion, drawerAsset.currentVersionId)}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
