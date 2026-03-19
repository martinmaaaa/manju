import React from 'react';

interface RunLogOverlayProps {
  open: boolean;
  title: string;
  subtitle: string;
  itemsCount: number;
  runningCount: number;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

export function RunLogOverlay({
  open,
  title,
  subtitle,
  itemsCount,
  runningCount,
  onToggle,
  onClose,
  children,
}: RunLogOverlayProps) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full border border-white/10 bg-black/75 px-4 py-3 text-sm text-white shadow-[0_18px_45px_rgba(0,0,0,0.35)] backdrop-blur"
      >
        <span className="font-semibold">日志</span>
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-xs text-white/70">
          {itemsCount}
        </span>
        {runningCount > 0 ? (
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-xs text-cyan-100">
            {runningCount} 运行中
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="fixed bottom-24 right-6 z-40 w-[min(460px,calc(100vw-32px))] rounded-[28px] border border-white/10 bg-[#05070b]/96 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/70">{title}</div>
              <div className="mt-2 text-sm leading-7 text-slate-300">{subtitle}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200"
            >
              收起
            </button>
          </div>
          <div className="mt-5 max-h-[60vh] overflow-y-auto pr-1">
            {children}
          </div>
        </div>
      ) : null}
    </>
  );
}
