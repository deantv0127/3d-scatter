import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { SYMBOL_METADATA, SymbolId } from '../game/types';

interface PaytableModalProps {
  bet: number;
  onClose: () => void;
}

const DISPLAY_ORDER: SymbolId[] = [
  'ACE',
  'KING',
  'QUEEN',
  'SPADE',
  'HEART',
  'CLUB',
  'DIAMOND',
];

const SPECIAL_ORDER: SymbolId[] = ['WILD', 'BONUS'];

export const PaytableModal: React.FC<PaytableModalProps> = ({
  bet,
  onClose,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/78"
      role="dialog"
      aria-modal="true"
      aria-label="Paytable and Rules"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[86dvh] flex flex-col rounded-2xl bg-[#0c111b] border border-amber-400/25 text-stone-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-amber-300">
              Paytable & Scatter Rules
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Payouts shown for current bet of{' '}
              <span className="font-mono-num text-stone-200">
                {bet.toFixed(2)} {bet === 1 ? 'coin' : 'coins'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close paytable"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-stone-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-6">
          {/* Grid Cascade Multiplier Trail */}
          <section className="p-3.5 rounded-xl bg-[#121927] border border-amber-400/20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                Cascade Grid Multipliers
              </h3>
              <div className="flex items-center gap-1.5 font-mono-num text-xs font-bold text-amber-200">
                <span>2×</span>
                <span className="text-stone-500">→</span>
                <span>3×</span>
                <span className="text-stone-500">→</span>
                <span>4×</span>
                <span className="text-stone-500">→</span>
                <span>6×</span>
                <span className="text-stone-500">→</span>
                <span>10×</span>
              </div>
            </div>
            <p className="text-xs text-stone-400 mt-1.5 leading-relaxed">
              Each consecutive scatter cascade advances the multiplier rail above
              the grid from 2× up to 10×. Land 3 or more Arcana Scatter (✦) cards
              anywhere to trigger 10 Free Spins.
            </p>
          </section>

          {/* Special Cards */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">
              Special Arcana Cards
            </h3>
            <div className="divide-y divide-white/10 border-y border-white/10">
              {SPECIAL_ORDER.map((id) => {
                const meta = SYMBOL_METADATA[id];
                return (
                  <div key={id} className="py-3 flex items-start gap-3">
                    <span
                      className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center font-display text-lg font-bold border border-white/15 bg-[#121927]"
                      style={{ color: meta.accentHex }}
                    >
                      {meta.shortLabel}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-stone-100">
                        {meta.name}
                      </div>
                      <p className="text-xs text-stone-400 mt-0.5 leading-relaxed">
                        {meta.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Scatter Paytable */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-3">
              Pay-Anywhere Scatter Payouts
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 divide-y divide-white/10 sm:divide-y-0">
              {DISPLAY_ORDER.map((id) => {
                const meta = SYMBOL_METADATA[id];
                return (
                  <div
                    key={id}
                    className="py-3 border-b border-white/10 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center font-display text-lg font-bold border border-white/15 bg-[#121927]"
                        style={{ color: meta.accentHex }}
                      >
                        {meta.shortLabel}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-stone-100 truncate">
                          {meta.name}
                        </div>
                        <div className="text-xs text-stone-400">
                          {meta.minMatch}+ anywhere
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-mono-num text-xs space-y-0.5 shrink-0">
                      {meta.payouts.map((tier, idx) => (
                        <div key={tier.count} className="flex items-center justify-end gap-2">
                          <span className="text-stone-400">
                            {tier.count}
                            {idx === meta.payouts.length - 1 ? '+' : ''}
                          </span>
                          <span className="text-amber-300 font-semibold">
                            {(bet * tier.mult).toFixed(2)} coins
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
