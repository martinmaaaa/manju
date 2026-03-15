import React from 'react';
import { useLanguage } from '../src/i18n/LanguageContext';
import { Galaxy } from './Galaxy';
import { Film, ImageIcon, Type } from 'lucide-react';
import { BRAND_LOGO_ALT, BRAND_WELCOME_SUBTITLE, BRAND_WELCOME_TITLE } from '../src/branding';

interface WelcomeScreenProps {
  visible: boolean;
  onCreatePromptInput: () => void;
  onCreateImageGenerator: () => void;
  onCreateVideoGenerator: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = React.memo(({
  visible,
  onCreatePromptInput,
  onCreateImageGenerator,
  onCreateVideoGenerator,
}) => {
  const { language, t } = useLanguage();

  if (!visible) return null;

  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] z-50 pointer-events-none ${
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
      }`}
    >
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <Galaxy
          focal={[0.5, 0.5]}
          rotation={[1.0, 0.0]}
          starSpeed={0.5}
          density={1.2}
          hueShift={280}
          disableAnimation={false}
          speed={0.7}
          mouseInteraction={true}
          glowIntensity={0.6}
          saturation={0.6}
          mouseRepulsion={true}
          twinkleIntensity={0.3}
          rotationSpeed={0.1}
          repulsionStrength={2}
          autoCenterRepulsion={0}
          transparent={false}
        />
      </div>

      <div className="flex flex-col items-center justify-center mb-10 select-none animate-in fade-in slide-in-from-bottom-8 duration-1000">
        <div className="relative mb-8">
          <img
            src="/logo.png"
            alt={BRAND_LOGO_ALT}
            className="h-40 md:h-52 object-contain drop-shadow-2xl"
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="h-px w-16 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
          <span className="text-xl md:text-2xl font-bold tracking-[0.3em] text-white animate-[glow_2s_ease-in-out_infinite]">
            {BRAND_WELCOME_TITLE}
          </span>
          <div className="h-px w-16 bg-gradient-to-l from-transparent via-cyan-500/50 to-transparent" />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 pointer-events-auto">
          <button
            onClick={onCreatePromptInput}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white shadow-xl hover:shadow-cyan-500/10 transition-all hover:scale-105"
          >
            <Type size={16} />
            <span className="text-sm font-semibold">文本</span>
          </button>
          <button
            onClick={onCreateImageGenerator}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-cyan-500/15 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-100 shadow-xl hover:shadow-cyan-500/20 transition-all hover:scale-105"
          >
            <ImageIcon size={16} />
            <span className="text-sm font-semibold">图片</span>
          </button>
          <button
            onClick={onCreateVideoGenerator}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white shadow-xl hover:shadow-cyan-500/10 transition-all hover:scale-105"
          >
            <Film size={16} />
            <span className="text-sm font-semibold">视频</span>
          </button>
        </div>

        <p className="mt-4 max-w-2xl text-center text-sm text-slate-300/80 pointer-events-auto">
          {BRAND_WELCOME_SUBTITLE}
        </p>

        <p className="mt-3 max-w-2xl text-center text-sm text-slate-400/80 pointer-events-auto">
          {t.actions.canvasHint}
          {language === 'zh'
            ? '，漫剧工作流已收口到“工作流”模块，画布仅保留通用创作能力。'
            : ', and the drama workflow now lives in Workflow while canvas keeps only generic creation tools.'}
        </p>

        <style>{`
          @keyframes glow {
            0%, 100% {
              text-shadow: 0 0 20px rgba(34, 211, 238, 0.3),
                           0 0 40px rgba(34, 211, 238, 0.2),
                           0 0 60px rgba(34, 211, 238, 0.1);
            }
            50% {
              text-shadow: 0 0 30px rgba(34, 211, 238, 0.6),
                           0 0 60px rgba(34, 211, 238, 0.4),
                           0 0 90px rgba(34, 211, 238, 0.2);
            }
          }
        `}</style>
      </div>
    </div>
  );
});
