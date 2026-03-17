import React from 'react';

interface AppShellProps {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  nav?: React.ReactNode;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  title,
  subtitle,
  rightSlot,
  nav,
  children,
}) => (
  <div className="min-h-screen bg-[#030507] text-white">
    <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(29,78,216,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(217,119,6,0.14),transparent_24%),linear-gradient(180deg,#05070b_0%,#020304_100%)]" />
    <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 pb-8 pt-6 md:px-6 xl:px-8">
      <header className="rounded-[28px] border border-white/10 bg-black/30 px-5 py-5 shadow-[0_24px_60px_rgba(0,0,0,0.28)] backdrop-blur">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.36em] text-cyan-300/75">Momo Workflow</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">{title}</h1>
            {subtitle ? <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">{subtitle}</p> : null}
          </div>
          {rightSlot ? <div className="flex flex-wrap items-center gap-3">{rightSlot}</div> : null}
        </div>
        {nav ? <div className="mt-5">{nav}</div> : null}
      </header>
      <main className="flex-1 py-6">{children}</main>
    </div>
  </div>
);
