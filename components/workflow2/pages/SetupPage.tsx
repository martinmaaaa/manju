import React from 'react';
import { Upload, Wand2 } from 'lucide-react';
import type { Episode, ProjectDetail, ScriptSource } from '../../../types/workflowApp';
import { Card, MetricTile, SummaryList } from '../PagePrimitives';

interface SetupDraftState {
  aspectRatio: string;
  styleSummary: string;
  targetMedium: string;
  globalPromptsText: string;
}

interface SetupPageProps {
  projectTitle?: string;
  storyBible?: ProjectDetail['storyBible'] | null;
  storyEpisodePreview: Array<{ episodeNumber: number; title: string; synopsis?: string }>;
  latestScriptSource: ScriptSource | null;
  episodes: Episode[];
  assetsCount: number;
  scriptText: string;
  scriptFileName: string | null;
  setupDraft: SetupDraftState;
  projectSettingSummary: string[];
  scriptSourceSaving: boolean;
  projectSetupSaving: boolean;
  isScriptDecomposeActive: boolean;
  onScriptTextChange: (value: string) => void;
  onScriptFileChange: (file: File | null) => void;
  onSaveScript: () => void | Promise<void>;
  onRunDirectorAnalysis: () => void | Promise<void>;
  onSetupDraftChange: (patch: Partial<SetupDraftState>) => void;
  onSaveProjectSetup: () => void | Promise<void>;
  onGoAssets: () => void;
  secondarySections?: React.ReactNode;
}

export function SetupPage({
  projectTitle,
  storyBible,
  storyEpisodePreview,
  latestScriptSource,
  episodes,
  assetsCount,
  scriptText,
  scriptFileName,
  setupDraft,
  projectSettingSummary,
  scriptSourceSaving,
  projectSetupSaving,
  isScriptDecomposeActive,
  onScriptTextChange,
  onScriptFileChange,
  onSaveScript,
  onRunDirectorAnalysis,
  onSetupDraftChange,
  onSaveProjectSetup,
  onGoAssets,
  secondarySections,
}: SetupPageProps) {
  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <Card
          eyebrow="流程一"
          title="导演分析剧本"
          action={(
            <button
              type="button"
              disabled={isScriptDecomposeActive}
              onClick={() => void onRunDirectorAnalysis()}
              className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Wand2 size={16} />
              {isScriptDecomposeActive ? '导演分析中...' : '运行导演分析'}
            </button>
          )}
        >
          <div className="grid gap-4 md:grid-cols-3">
            <MetricTile label="剧本状态" value={latestScriptSource?.contentText ? '已保存' : '待录入'} hint={latestScriptSource ? `最近保存于 ${new Date(latestScriptSource.createdAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '先保存剧本后再运行分析'} />
            <MetricTile label="剧集预估" value={storyBible?.episodes?.length || episodes.length || 0} hint="分析后自动生成剧集列表" />
            <MetricTile label="资产候选" value={(storyBible?.characters?.length || 0) + (storyBible?.scenes?.length || 0) + (storyBible?.props?.length || 0) || assetsCount || 0} hint="人物、场景、道具会进入下一步资产生产" />
          </div>

          <div className="mt-5 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">剧本文本</div>
              <textarea
                value={scriptText}
                onChange={(event) => onScriptTextChange(event.target.value)}
                className="mt-3 min-h-[360px] w-full rounded-[24px] border border-white/10 bg-white/[0.04] p-5 text-sm leading-7 text-slate-100 outline-none"
                placeholder="在这里粘贴剧本文本，或上传 docx / pdf / txt / md 文件。"
              />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200">
                  <Upload size={16} />
                  选择文件
                  <input
                    type="file"
                    accept=".doc,.docx,.pdf,.txt,.md"
                    className="hidden"
                    onChange={(event) => onScriptFileChange(event.target.files?.[0] || null)}
                  />
                </label>
                {scriptFileName ? <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">{scriptFileName}</div> : null}
                <button
                  type="button"
                  disabled={scriptSourceSaving || (!scriptFileName && !scriptText.trim())}
                  onClick={() => void onSaveScript()}
                  className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {scriptSourceSaving ? '保存剧本中...' : '保存剧本'}
                </button>
              </div>
              {isScriptDecomposeActive ? (
                <div className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.08] px-4 py-3 text-sm text-cyan-100">
                  导演分析正在运行。完成后会沉淀项目圣经、主体清单和剧集结构。
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">项目基线</div>
                <div className="mt-4 grid gap-4">
                  <select value={setupDraft.aspectRatio} onChange={(event) => onSetupDraftChange({ aspectRatio: event.target.value })} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none">
                    {['1:1', '3:4', '4:3', '9:16', '16:9'].map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                  </select>
                  <input value={setupDraft.targetMedium} onChange={(event) => onSetupDraftChange({ targetMedium: event.target.value })} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none" placeholder="目标载体，例如漫剧、短剧、PV" />
                  <textarea value={setupDraft.styleSummary} onChange={(event) => onSetupDraftChange({ styleSummary: event.target.value })} className="min-h-[120px] rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none" placeholder="整体风格说明，例如古风、电影感、色调、镜头语言。" />
                  <textarea value={setupDraft.globalPromptsText} onChange={(event) => onSetupDraftChange({ globalPromptsText: event.target.value })} className="min-h-[140px] rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-white outline-none" placeholder="全局提示词，每行一条。" />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {projectSettingSummary.map((item) => (
                    <span key={item} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-slate-200">
                      {item}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={projectSetupSaving}
                  onClick={() => void onSaveProjectSetup()}
                  className="mt-5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {projectSetupSaving ? '保存配置中...' : '保存项目配置'}
                </button>
              </div>

              <div className="rounded-[24px] border border-cyan-300/15 bg-cyan-300/[0.07] p-5">
                <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/70">下一步</div>
                <div className="mt-3 text-xl font-semibold text-white">进入资产生产</div>
                <div className="mt-3 text-sm leading-7 text-cyan-100/80">
                  导演分析负责读完整个项目；下一页开始统一处理人物、场景和道具资产。
                </div>
                <button
                  type="button"
                  onClick={onGoAssets}
                  className="mt-5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
                >
                  查看资产生产
                </button>
              </div>
            </div>
          </div>
        </Card>

        <section className="space-y-6">
          <Card eyebrow="分析结果" title="导演讲戏本">
            {storyBible ? (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/35">一句话概述</div>
                  <div className="mt-3 text-lg font-semibold text-white">{storyBible.logline || storyBible.title || projectTitle || '当前项目'}</div>
                  <div className="mt-3 text-sm leading-7 text-slate-300">{storyBible.summary || '剧本分析已完成，但还没有沉淀摘要。'}</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <MetricTile label="人物清单" value={storyBible.characters.length} />
                  <MetricTile label="场景清单" value={storyBible.scenes.length} />
                  <MetricTile label="道具清单" value={storyBible.props.length} />
                  <MetricTile label="剧集数量" value={storyBible.episodes.length} />
                </div>
                <SummaryList title="人物" items={storyBible.characters.map((item) => `${item.name} · ${item.description}`)} emptyLabel="运行导演分析后，这里会出现角色清单。" />
                <SummaryList title="场景" items={storyBible.scenes.map((item) => `${item.name} · ${item.description}`)} emptyLabel="运行导演分析后，这里会出现场景清单。" />
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-12 text-sm leading-7 text-slate-300">
                运行导演分析后，这里会出现项目圣经、人物清单、场景清单和剧集预览。
              </div>
            )}
          </Card>

          <Card eyebrow="剧集预览" title="主流程出口">
            <div className="space-y-3">
              {storyEpisodePreview.map((episode) => (
                <div key={`${episode.episodeNumber}-${episode.title}`} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-white/35">第 {episode.episodeNumber} 集</div>
                  <div className="mt-2 text-sm font-semibold text-white">{episode.title}</div>
                  <div className="mt-2 text-sm leading-7 text-slate-300">{episode.synopsis || '待生成单集梗概。'}</div>
                </div>
              ))}
              {storyEpisodePreview.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-slate-400">
                  还没有剧集预览。先保存剧本并运行导演分析。
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onGoAssets}
              className="mt-5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-100"
            >
              继续到资产页
            </button>
          </Card>
        </section>
      </section>

      {secondarySections}
    </div>
  );
}
