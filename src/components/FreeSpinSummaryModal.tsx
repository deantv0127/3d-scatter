import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { soundEngine } from '../game/audio';

interface FreeSpinSummaryModalProps {
  totalWin: number;
  spinsPlayed: number;
  onCollect: () => void;
}

export const FreeSpinSummaryModal: React.FC<FreeSpinSummaryModalProps> = ({
  totalWin,
  spinsPlayed,
  onCollect,
}) => {
  const [displayAmount, setDisplayAmount] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [isComplete, setIsComplete] = useState<boolean>(false);

  const rafRef = useRef<number | null>(null);
  const completedRef = useRef<boolean>(false);
  const collectedRef = useRef<boolean>(false);
  const lastTickTimeRef = useRef<number>(0);

  const finalizeRollup = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (!completedRef.current) {
      completedRef.current = true;
      setDisplayAmount(totalWin);
      setProgress(1);
      setIsComplete(true);
      soundEngine.playFreeSpinFinale(totalWin > 0);
    }
  }, [totalWin]);

  const handleCollect = useCallback(() => {
    if (collectedRef.current) return;
    collectedRef.current = true;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    soundEngine.playClick();
    onCollect();
  }, [onCollect]);

  useEffect(() => {
    completedRef.current = false;
    collectedRef.current = false;
    setDisplayAmount(0);
    setProgress(0);
    setIsComplete(false);

    if (totalWin <= 0) {
      const timer = window.setTimeout(() => {
        finalizeRollup();
      }, 320);
      return () => window.clearTimeout(timer);
    }

    const duration = Math.min(2400, Math.max(1350, 1150 + totalWin * 2.2));
    const startTime = performance.now();
    lastTickTimeRef.current = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      // Smooth cubic ease-out so numbers accelerate early and settle cleanly
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayAmount(totalWin * eased);
      setProgress(eased);

      if (t < 1) {
        if (now - lastTickTimeRef.current >= 58) {
          lastTickTimeRef.current = now;
          soundEngine.playRollupTick(t);
        }
        rafRef.current = requestAnimationFrame(tick);
      } else {
        finalizeRollup();
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [totalWin, finalizeRollup]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (!completedRef.current) {
          finalizeRollup();
        } else {
          handleCollect();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCollect();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [finalizeRollup, handleCollect]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/84"
      role="dialog"
      aria-modal="true"
      aria-label="Free Spins Summary"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        onClick={() => {
          if (!completedRef.current) {
            finalizeRollup();
          }
        }}
        className="relative w-full max-w-md rounded-2xl bg-gradient-to-b from-[#1d142c] via-[#101523] to-[#080b12] border border-amber-400/60 p-6 sm:p-8 text-center shadow-[0_24px_70px_rgba(0,0,0,0.88)] overflow-hidden"
      >
        {/* Static/transitioned ambient gold radial glow (no blur filters) */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 transition-opacity duration-500 bg-[radial-gradient(circle_at_50%_38%,rgba(245,158,11,0.22),transparent_68%)] ${
            isComplete && totalWin > 0 ? 'opacity-100' : 'opacity-45'
          }`}
        />

        <div className="relative z-10 flex flex-col items-center">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.26em] text-fuchsia-300">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Free Spins Complete</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          </div>

          <h2 className="font-display text-2xl sm:text-3xl font-bold text-amber-200 mt-2">
            {totalWin > 0 ? 'Total Bonus Won' : 'Bonus Round Complete'}
          </h2>

          <p className="text-xs sm:text-sm text-stone-300 mt-1">
            Summed across{' '}
            <span className="font-mono-num font-semibold text-fuchsia-200">
              {spinsPlayed}
            </span>{' '}
            {spinsPlayed === 1 ? 'free spin' : 'free spins'}
          </p>

          {/* Animated Roll-Up Counter */}
          <motion.div
            animate={
              isComplete && totalWin > 0
                ? { scale: [1, 1.09, 1] }
                : { scale: 1 }
            }
            transition={{ duration: 0.42, ease: 'easeOut' }}
            className="my-6 w-full py-5 px-4 rounded-xl bg-[#070a11]/90 border border-amber-400/35 shadow-inner"
          >
            <div className="text-[10px] uppercase tracking-[0.24em] text-stone-400 mb-1">
              Bonus Vault Payout
            </div>
            <div
              className={`font-mono-num text-4xl sm:text-5xl font-extrabold tracking-tight leading-none ${
                totalWin > 0 ? 'text-amber-300' : 'text-stone-300'
              }`}
            >
              $
              {displayAmount.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>

            {/* Synchronized Roll-Up Progress Track */}
            <div className="mt-4 h-1.5 w-full rounded-full bg-[#121826] overflow-hidden border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-fuchsia-400 via-amber-400 to-yellow-200"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </motion.div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleCollect();
            }}
            className="w-full min-h-[48px] px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-stone-950 font-bold text-base tracking-wide shadow-lg shadow-amber-500/25 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
          >
            {isComplete
              ? totalWin > 0
                ? 'Collect to Balance'
                : 'Continue'
              : 'Collect Now'}
          </button>

          {!isComplete && totalWin > 0 && (
            <p className="text-[11px] text-stone-400 mt-2.5">
              Tap card or press Space to reveal full total
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
};
