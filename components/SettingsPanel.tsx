import React, { useState } from 'react';
import { X, Server, CheckCircle, RefreshCw } from 'lucide-react';
import { StorageSettingsPanel } from './StorageSettingsPanel';
import { ModelPriorityTab } from './settings/ModelPriorityTab';
import { SoraSettingsTab } from './settings/SoraSettingsTab';
import { JimengSettingsTab } from './settings/JimengSettingsTab';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = React.memo(({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'models' | 'storage' | 'sora' | 'jimeng'>('basic');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative mx-4 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#1c1c1e] shadow-2xl">
        <div className="absolute inset-0 pointer-events-none opacity-5">
          <div className="absolute top-0 left-0 h-96 w-96 rounded-full bg-cyan-500 blur-[120px]" />
          <div className="absolute right-0 bottom-0 h-96 w-96 rounded-full bg-orange-500 blur-[120px]" />
        </div>

        <div className="relative flex items-center justify-between border-b border-white/5 bg-white/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-cyan-500/20 to-orange-500/20 p-2">
              <Server size={20} className="text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">设置</h2>
              <p className="mt-0.5 text-[10px] text-slate-400">Server-managed workflow settings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition-all hover:bg-white/10 hover:text-white"
            aria-label="关闭设置"
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative flex border-b border-white/10">
          {[
            { key: 'basic' as const, label: '基础设置', activeColor: 'text-cyan-400 border-cyan-400' },
            { key: 'models' as const, label: '模型优先级', activeColor: 'text-cyan-400 border-cyan-400' },
            { key: 'jimeng' as const, label: '即梦 (Jimeng)', activeColor: 'text-blue-400 border-blue-400' },
            { key: 'sora' as const, label: 'Sora 2', activeColor: 'text-green-400 border-green-400' },
            { key: 'storage' as const, label: '存储设置', activeColor: 'text-cyan-400 border-cyan-400' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-4 py-3 text-xs font-bold transition-all ${
                activeTab === tab.key
                  ? `${tab.activeColor} border-b-2 bg-white/5`
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'basic' ? (
            <div className="space-y-6 p-8">
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-5">
                <div className="flex items-center gap-2 text-cyan-300">
                  <CheckCircle size={16} />
                  <span className="text-sm font-semibold">在线工作流已切换为服务端统一代理</span>
                </div>
                <div className="mt-3 space-y-2 text-sm leading-7 text-slate-300">
                  <p>当前在线工作流不再依赖浏览器本地保存的 Gemini / Yunwu / Custom API Key。</p>
                  <p>文本、图片、视频模型由服务端统一调度，并通过项目阶段配置来选择能力与模型。</p>
                  <p>如果你在旧画布中仍看到 legacy provider 相关逻辑，请把它视为兼容层，而不是新主链路。</p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="text-sm font-semibold text-white">当前建议</div>
                <div className="mt-3 space-y-2 text-sm leading-7 text-slate-300">
                  <p>1. 在线工作流直接使用服务端配置，不要再在浏览器里保存新的第三方模型密钥。</p>
                  <p>2. 需要调整模型路由时，优先在项目的 Stage Config 中选择能力对应模型。</p>
                  <p>3. 旧设置页里的“模型优先级 / 存储 / Sora / 即梦”仍保留，用于兼容历史模块。</p>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 text-slate-300">
                  <RefreshCw size={14} />
                  <span className="text-xs font-bold uppercase tracking-[0.24em]">Legacy Compatibility</span>
                </div>
                <p className="mt-2 text-[12px] leading-6 text-slate-400">
                  This panel now serves as guidance for the legacy canvas stack. The new workflow-first path uses server-side model orchestration.
                </p>
              </div>
            </div>
          ) : activeTab === 'models' ? (
            <ModelPriorityTab onClose={onClose} />
          ) : activeTab === 'sora' ? (
            <SoraSettingsTab onClose={onClose} />
          ) : activeTab === 'jimeng' ? (
            <JimengSettingsTab />
          ) : (
            <StorageSettingsPanel getCurrentWorkspaceId={() => 'default'} />
          )}
        </div>

        {activeTab === 'basic' ? (
          <div className="relative flex items-center justify-end border-t border-white/5 bg-[#121214] px-6 py-4">
            <button
              onClick={onClose}
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-orange-500 px-6 py-2.5 text-sm font-medium text-white transition-all hover:from-cyan-400 hover:to-orange-400"
            >
              知道了
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default SettingsPanel;
