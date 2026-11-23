import React, { useCallback, useEffect } from 'react';
import { Gift, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { soundEngine } from '../game/audio';

interface DailyBonusModalProps {
  rewardAmount: number;
  streak: number;
  onClose: () => void;
}

const STREAK_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const DailyBonusModal: React.FC<DailyBonusModalProps> = ({
  rewardAmount,
  streak,
  onClose,
}) => {
  const handleDismiss = useCallback(() => {
    soundEngine.playClick();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleDismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [handleDismiss]);

  const activeLadderDay = Math.min(Math.max(1, streak), 7);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/84"
      role="dialog"
      aria-modal="true"
      aria-label="Daily Login Bonus"
      onClick={handleDismiss}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl bg-gradient-to-b from-[#1a1826] via-[#0f1522] to-[#080b12] border border-amber-400/55 p-6 sm:p-7 text-center shadow-[0_24px_70px_rgba(0,0,0,0.88)] overflow-hidden"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(245,158,11,0.2),transparent_68%)]"
        />

        <div className="relative z-10 flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/18 border border-amber-400/50 flex items-center justify-center text-amber-300 mb-3 shadow-lg shadow-amber-500/15">
            <Gift className="w-6 h-6" />
          </div>

          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Daily Vault Reward</span>
            <Sparkles className="w-3.5 h-3.5" />
          </div>

          <h2 className="font-display text-2xl sm:text-3xl font-bold text-stone-100 mt-1.5">
            Day {streak} Login Bonus
          </h2>

          <p className="text-xs sm:text-sm text-stone-300 mt-1">
            Credited automatically to your Sovereign Arcana vault
          </p>

          <div className="my-5 w-full py-5 px-4 rounded-xl bg-[#070a11]/90 border border-amber-400/35 shadow-inner">
            <div className="text-[10px] uppercase tracking-[0.22em] text-stone-400 mb-1">
              Coins Added
            </div>
            <div className="font-mono-num text-4xl sm:text-5xl font-extrabold text-amber-300 tracking-tight leading-none">
              +{rewardAmount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              <span className="text-xl sm:text-2xl font-semibold text-amber-200/85 ml-2">
                coins
              </span>
            </div>

            {/* 7-Day Streak Ladder */}
            <div className="mt-5 grid grid-cols-7 gap-1.5">
              {STREAK_DAYS.map((day) => {
                const isToday = day === activeLadderDay;
                const isClaimed = day < activeLadderDay;
                return (
                  <div
                    key={day}
                    className={`rounded-lg py-1.5 px-0.5 border text-center ${
                      isToday
                        ? 'bg-amber-500/25 border-amber-300 text-amber-200'
                        : isClaimed
                          ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                          : 'bg-[#101624] border-white/10 text-stone-400'
                    }`}
                  >
                    <div className="text-[9px] uppercase tracking-wider leading-none">
                      D{day}
                    </div>
                    <div className="font-mono-num text-[10px] font-bold mt-1 leading-none">
                      50c
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-stone-400 mb-4">
            Next daily login bonus unlocks in 24 hours.
          </p>

          <button
            type="button"
            onClick={handleDismiss}
            className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-stone-950 font-bold text-base tracking-wide shadow-lg shadow-amber-500/25 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
          >
            Play Now
          </button>
        </div>
      </motion.div>
    </div>
  );
};
