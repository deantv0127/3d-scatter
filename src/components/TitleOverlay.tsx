import React from 'react';

interface TitleOverlayProps {
  onStart: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({ onStart }) => {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-between px-5 py-8 pointer-events-none">
      {/* Top quiet brand line */}
      <div className="pt-safe text-xs tracking-[0.26em] uppercase text-amber-300/80 font-medium">
        Royal Scatter Table
      </div>

      {/* Center focal lockup over calm negative space */}
      <div className="flex flex-col items-center text-center max-w-md px-6 py-7 rounded-2xl bg-[#070a10]/78 border border-amber-400/20 shadow-2xl pointer-events-auto">
        <svg
          viewBox="0 0 360 88"
          className="w-72 sm:w-80 h-auto mb-3"
          aria-label="Sovereign Arcana"
        >
          <defs>
            <linearGradient id="goldTitleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef3c7" />
              <stop offset="48%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
          </defs>
          {/* Ornamental top crest */}
          <path
            d="M168 12 L180 4 L192 12 L180 20 Z"
            fill="url(#goldTitleGrad)"
          />
          <line
            x1="56"
            y1="12"
            x2="156"
            y2="12"
            stroke="#d4af37"
            strokeOpacity="0.45"
            strokeWidth="1.2"
          />
          <line
            x1="204"
            y1="12"
            x2="304"
            y2="12"
            stroke="#d4af37"
            strokeOpacity="0.45"
            strokeWidth="1.2"
          />
          <text
            x="180"
            y="50"
            textAnchor="middle"
            fill="url(#goldTitleGrad)"
            fontFamily="Cinzel, Georgia, serif"
            fontSize="31"
            fontWeight="800"
            letterSpacing="4"
          >
            SOVEREIGN
          </text>
          <text
            x="180"
            y="77"
            textAnchor="middle"
            fill="#e2e8f0"
            fontFamily="Cinzel, Georgia, serif"
            fontSize="20"
            fontWeight="700"
            letterSpacing="8"
          >
            ARCANA
          </text>
        </svg>

        <p className="text-sm text-stone-300 leading-relaxed mb-6">
          Pay-anywhere 3D scatter cascades with grid multipliers up to 10× and
          10-spin scatter vaults.
        </p>

        <button
          type="button"
          onClick={onStart}
          className="min-h-[48px] px-9 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-stone-950 font-semibold text-base tracking-wide transition-all shadow-lg shadow-amber-500/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 cursor-pointer"
        >
          Deal Cards
        </button>
      </div>

      {/* Flat single-line control hint */}
      <div className="pb-safe text-xs text-stone-400 tracking-wide text-center">
        Space Spin · Tap Card Inspect · M Mute
      </div>
    </div>
  );
};
