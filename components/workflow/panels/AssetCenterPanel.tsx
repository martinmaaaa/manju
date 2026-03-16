import React, { useMemo, useState } from 'react';
import { GitBranchPlus, Package2, Plus, Shapes, Sparkles, Users } from 'lucide-react';
import type { WorkflowAsset, WorkflowAssetType, WorkflowAssetVersion } from '../../../services/workflow/domain/types';

interface AssetCenterPanelProps {
  assets: WorkflowAsset[];
  assetVersions: WorkflowAssetVersion[];
  onCreateAsset: (type: WorkflowAssetType, name: string, tags: string[]) => void;
  onCreateAssetVersion: (assetId: string, notes?: string) => void;
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
  onCreateAsset,
  onCreateAssetVersion,
}) => {
  const [type, setType] = useState<WorkflowAssetType>('character');
  const [name, setName] = useState('');
  const [tagsInput, setTagsInput] = useState('');
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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    onCreateAsset(
      type,
      trimmedName,
      tagsInput.split(/[，,]/).map(item => item.trim()).filter(Boolean),
    );

    setName('');
    setTagsInput('');
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
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
        >
          <Plus size={15} />
          新增资产
        </button>
      </form>

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

                    return (
                      <div key={asset.id} className="rounded-[18px] border border-white/10 bg-white/[0.03] p-4">
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
