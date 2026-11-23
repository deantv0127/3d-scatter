import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Minus,
  Plus,
  RefreshCw,
  Repeat,
  RotateCw,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { PaytableModal } from './components/PaytableModal';
import { TitleOverlay } from './components/TitleOverlay';
import { soundEngine } from './game/audio';
import { CardSlotStage } from './game/CardSlotStage';
import { resolveSpinOutcome } from './game/slotEngine';
import {
  BET_STEPS,
  CardCellData,
  MultiplierValue,
  SYMBOL_METADATA,
} from './game/types';

type GamePhase = 'title' | 'playing';

interface WinBannerState {
  visible: boolean;
  label: string;
  amount: number;
  multiplier: number;
  isBig: boolean;
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<CardSlotStage | null>(null);

  const [phase, setPhase] = useState<GamePhase>('title');
  const [balance, setBalance] = useState<number>(2500);
  const [betIndex, setBetIndex] = useState<number>(2); // $5 default
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [turboMode, setTurboMode] = useState<boolean>(false);
  const [autoPlay, setAutoPlay] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [showPaytable, setShowPaytable] = useState<boolean>(false);
  const [contextLost, setContextLost] = useState<boolean>(false);

  // Free Spins & Multiplier Progression
  const [freeSpinsLeft, setFreeSpinsLeft] = useState<number>(0);
  const [freeSpinGlobalMult, setFreeSpinGlobalMult] = useState<number>(0);
  const [freeSpinRoundWin, setFreeSpinRoundWin] = useState<number>(0);

  // Live Win & Cascade Callouts
  const [lastWin, setLastWin] = useState<number>(0);
  const [displayWin, setDisplayWin] = useState<number>(0);
  const [winBanner, setWinBanner] = useState<WinBannerState>({
    visible: false,
    label: '',
    amount: 0,
    multiplier: 1,
    isBig: false,
  });
  const [bonusBannerText, setBonusBannerText] = useState<string | null>(null);
  const [inspectedCard, setInspectedCard] = useState<CardCellData | null>(null);

  // Mutable refs for latest values inside async spin flow & keyboard listeners
  const stateRef = useRef({
    phase,
    balance,
    betIndex,
    isSpinning,
    turboMode,
    autoPlay,
    freeSpinsLeft,
    freeSpinGlobalMult,
    freeSpinRoundWin,
    showPaytable,
  });
  stateRef.current = {
    phase,
    balance,
    betIndex,
    isSpinning,
    turboMode,
    autoPlay,
    freeSpinsLeft,
    freeSpinGlobalMult,
    freeSpinRoundWin,
    showPaytable,
  };

  const inspectTimeoutRef = useRef<number | null>(null);
  const winAnimRef = useRef<number | null>(null);

  const currentBet = BET_STEPS[betIndex];

  // Mount isolated Three.js stage once
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const stage = new CardSlotStage(mount, {
      onCardInspect: (cell) => {
        setInspectedCard(cell);
        if (inspectTimeoutRef.current) {
          window.clearTimeout(inspectTimeoutRef.current);
        }
        inspectTimeoutRef.current = window.setTimeout(() => {
          setInspectedCard(null);
        }, 2600);
      },
      onCascadeStep: (stepIndex, _stepWin, runningBaseWin) => {
        setWinBanner({
          visible: true,
          label: stepIndex > 1 ? `Cascade ×${stepIndex}` : 'Scatter Win',
          amount: runningBaseWin,
          multiplier: 1,
          isBig: false,
        });
      },
      onMultiplierPulse: (value: MultiplierValue, totalApplied: number) => {
        setWinBanner((prev) => ({
          ...prev,
          visible: true,
          label: `Foil Seal +${value}×`,
          multiplier: totalApplied,
        }));
      },
      onContextLostChange: (lost) => {
        setContextLost(lost);
      },
    });

    stageRef.current = stage;
    return () => {
      if (inspectTimeoutRef.current) {
        window.clearTimeout(inspectTimeoutRef.current);
      }
      if (winAnimRef.current) {
        cancelAnimationFrame(winAnimRef.current);
      }
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  const animateWinCounter = useCallback((target: number) => {
    if (winAnimRef.current) {
      cancelAnimationFrame(winAnimRef.current);
    }
    if (target <= 0) {
      setDisplayWin(0);
      return;
    }
    const startVal = 0;
    const duration = Math.min(950, Math.max(320, target * 6));
    const startTime = performance.now();
    let tickStep = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = startVal + (target - startVal) * eased;
      setDisplayWin(val);
      if (t < 1) {
        if (Math.floor(t * 10) > tickStep) {
          tickStep = Math.floor(t * 10);
          soundEngine.playBigWinTick(tickStep);
        }
        winAnimRef.current = requestAnimationFrame(step);
      } else {
        setDisplayWin(target);
      }
    };
    winAnimRef.current = requestAnimationFrame(step);
  }, []);

  const handleStartGame = useCallback(() => {
    soundEngine.unlock();
    soundEngine.playClick();
    setPhase('playing');
    stageRef.current?.setMode('idle');
  }, []);

  const executeSpin = useCallback(async () => {
    const s = stateRef.current;
    if (s.isSpinning || s.phase !== 'playing' || s.showPaytable) return;
    const stage = stageRef.current;
    if (!stage) return;

    const bet = BET_STEPS[s.betIndex];
    const inFreeSpin = s.freeSpinsLeft > 0;

    if (!inFreeSpin && s.balance < bet) {
      setAutoPlay(false);
      return;
    }

    soundEngine.unlock();
    setIsSpinning(true);
    setInspectedCard(null);
    setBonusBannerText(null);
    setWinBanner({
      visible: false,
      label: '',
      amount: 0,
      multiplier: 1,
      isBig: false,
    });

    if (inFreeSpin) {
      setFreeSpinsLeft((prev) => Math.max(0, prev - 1));
    } else {
      setBalance((prev) => Math.round((prev - bet) * 100) / 100);
    }

    const outcome = resolveSpinOutcome(
      bet,
      inFreeSpin,
      inFreeSpin ? s.freeSpinGlobalMult : 0,
    );

    await stage.playSpinSequence(outcome, s.turboMode);

    if (outcome.totalWin > 0) {
      const isBig = outcome.totalWin >= bet * 10;
      setBalance((prev) => Math.round((prev + outcome.totalWin) * 100) / 100);
      setLastWin(outcome.totalWin);
      animateWinCounter(outcome.totalWin);
      setWinBanner({
        visible: true,
        label: isBig ? 'Sovereign Win' : 'Total Win',
        amount: outcome.totalWin,
        multiplier: outcome.appliedMultiplier,
        isBig,
      });

      if (inFreeSpin) {
        setFreeSpinRoundWin((prev) => Math.round((prev + outcome.totalWin) * 100) / 100);
        if (outcome.boardMultiplierSum > 0) {
          setFreeSpinGlobalMult((prev) => prev + outcome.boardMultiplierSum);
        }
      }
    } else {
      setLastWin(0);
      setDisplayWin(0);
    }

    if (outcome.awardedFreeSpins > 0) {
      setFreeSpinsLeft((prev) => prev + outcome.awardedFreeSpins);
      setBonusBannerText(
        inFreeSpin
          ? `+${outcome.awardedFreeSpins} Extra Free Spins`
          : `Arcana Vault Unlocked · ${outcome.awardedFreeSpins} Free Spins`,
      );
      if (!inFreeSpin) {
        setFreeSpinGlobalMult(Math.max(1, outcome.boardMultiplierSum));
        setFreeSpinRoundWin(0);
      }
    } else if (inFreeSpin && s.freeSpinsLeft - 1 === 0) {
      // Final free spin completed
      setFreeSpinGlobalMult(0);
    }

    setIsSpinning(false);
  }, [animateWinCounter]);

  // Autoplay / Free Spins continuation loop
  useEffect(() => {
    if (isSpinning || phase !== 'playing' || showPaytable) return;
    if (freeSpinsLeft > 0 || autoPlay) {
      const bet = BET_STEPS[betIndex];
      if (freeSpinsLeft === 0 && balance < bet) {
        setAutoPlay(false);
        return;
      }
      const delay = turboMode ? 320 : 620;
      const timer = window.setTimeout(() => {
        void executeSpin();
      }, delay);
      return () => window.clearTimeout(timer);
    }
  }, [
    isSpinning,
    phase,
    showPaytable,
    freeSpinsLeft,
    autoPlay,
    balance,
    betIndex,
    turboMode,
    executeSpin,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (e.code === 'Space' || e.code === 'Enter') {
        if (s.phase === 'title') {
          e.preventDefault();
          handleStartGame();
        } else if (!s.showPaytable && !s.isSpinning) {
          e.preventDefault();
          void executeSpin();
        }
      } else if (e.key === 'm' || e.key === 'M') {
        setMuted(soundEngine.toggleMute());
      } else if (e.key === 't' || e.key === 'T') {
        soundEngine.playClick();
        setTurboMode((v) => !v);
      } else if (e.key === 'h' || e.key === 'H') {
        if (s.phase === 'playing') {
          soundEngine.playClick();
          setDockCollapsed((v) => !v);
        }
      } else if (e.key === 'Escape') {
        setShowPaytable(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [executeSpin, handleStartGame]);

  const handleToggleMute = () => {
    setMuted(soundEngine.toggleMute());
  };

  const handleStepBet = (dir: -1 | 1) => {
    if (isSpinning || freeSpinsLeft > 0) return;
    soundEngine.playClick();
    setBetIndex((prev) =>
      Math.max(0, Math.min(BET_STEPS.length - 1, prev + dir)),
    );
  };

  const handleRefill = () => {
    soundEngine.unlock();
    soundEngine.playMultiplierHit(5);
    setBalance((prev) => Math.round((prev + 1000) * 100) / 100);
  };

  const canSpin = !isSpinning && (freeSpinsLeft > 0 || balance >= currentBet);
  const needsRefill = !isSpinning && freeSpinsLeft === 0 && balance < currentBet;

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-[#070a10] select-none">
      {/* Isolated WebGL Mount Container */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />

      {/* WebGL Context Lost Fallback */}
      {contextLost && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#070a10]/95 p-6 text-center">
          <div className="max-w-sm space-y-3">
            <h2 className="font-display text-xl text-amber-300 font-bold">
              Graphics Context Paused
            </h2>
            <p className="text-sm text-stone-300">
              Your device temporarily reclaimed WebGL memory. Reload the page if
              the 3D table does not resume automatically.
            </p>
          </div>
        </div>
      )}

      {/* Title Screen */}
      {phase === 'title' && <TitleOverlay onStart={handleStartGame} />}

      {/* Active Game HUD */}
      {phase === 'playing' && (
        <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between">
          {/* Top Compact Perimeter Bar */}
          <header className="pt-safe px-3 sm:px-6 pt-2.5 flex items-center justify-between gap-3">
            {/* Balance & Active Bonus Readout */}
            <div className="pointer-events-auto flex items-center gap-3 sm:gap-4 px-3.5 py-2 rounded-xl bg-[#0b101b]/88 border border-amber-400/20 shadow-lg">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-stone-400 leading-none">
                  Balance
                </div>
                <div className="font-mono-num text-sm sm:text-base font-bold text-stone-100 mt-1 leading-none">
                  ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div className="sm:hidden flex items-center gap-3">
                <div className="h-6 w-px bg-white/15" aria-hidden="true" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-400 leading-none">
                    Win
                  </div>
                  <div
                    className={`font-mono-num text-sm font-bold mt-1 leading-none ${
                      lastWin > 0 ? 'text-emerald-300' : 'text-stone-400'
                    }`}
                  >
                    ${displayWin.toFixed(2)}
                  </div>
                </div>
              </div>

              {freeSpinsLeft > 0 && (
                <>
                  <div className="h-6 w-px bg-white/15" aria-hidden="true" />
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-fuchsia-300 leading-none">
                      Free Spins
                    </div>
                    <div className="font-mono-num text-sm sm:text-base font-bold text-fuchsia-200 mt-1 leading-none">
                      {freeSpinsLeft} left
                      {freeSpinGlobalMult > 0 ? ` · ${freeSpinGlobalMult}×` : ''}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Right Utility Controls (>= 44px touch targets) */}
            <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setTurboMode((v) => !v);
                }}
                aria-label="Toggle turbo spin speed"
                aria-pressed={turboMode}
                title="Turbo Spin (T)"
                className={`min-w-[44px] min-h-[44px] px-2.5 flex items-center justify-center gap-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                  turboMode
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                    : 'bg-[#0b101b]/88 border-white/15 text-stone-300 hover:text-white'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span className="hidden sm:inline">Turbo</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setShowPaytable(true);
                }}
                aria-label="Open paytable and rules"
                title="Paytable"
                className="min-w-[44px] min-h-[44px] px-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-[#0b101b]/88 border border-white/15 text-stone-300 hover:text-white transition-colors cursor-pointer"
              >
                <HelpCircle className="w-4 h-4" />
                <span className="hidden sm:inline text-xs font-medium">Rules</span>
              </button>

              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
                title="Mute / Unmute (M)"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[#0b101b]/88 border border-white/15 text-stone-300 hover:text-white transition-colors cursor-pointer"
              >
                {muted ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-300" />
                )}
              </button>
            </div>
          </header>

          {/* Non-Blocking Upper Win / Multiplier Callout Zone */}
          <div className="flex flex-col items-center justify-start pt-2 px-4 pointer-events-none">
            {bonusBannerText && (
              <div className="mb-1.5 px-4 py-1.5 rounded-xl bg-[#1f0c24]/92 border border-fuchsia-400/50 text-fuchsia-200 font-display text-xs sm:text-sm font-bold tracking-wider uppercase shadow-lg">
                {bonusBannerText}
              </div>
            )}

            {winBanner.visible && (
              <div
                className={`px-5 py-2 rounded-xl border shadow-xl text-center transition-transform duration-150 ${
                  winBanner.isBig
                    ? 'bg-[#241806]/92 border-amber-400/70'
                    : 'bg-[#0b101b]/90 border-amber-400/35'
                }`}
              >
                <div className="text-[11px] uppercase tracking-[0.18em] text-amber-300 font-semibold">
                  {winBanner.label}
                  {winBanner.multiplier > 1
                    ? ` · ${winBanner.multiplier}× Multiplier`
                    : ''}
                </div>
                <div className="font-mono-num text-xl sm:text-2xl font-bold text-white leading-tight mt-0.5">
                  +${winBanner.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Ergonomic Control Dock + Card Inspect Strip */}
          <div className="flex flex-col items-center pb-safe px-3 sm:px-5 pb-2.5">
            {/* Inspected 3D Card Info Strip (when tapping a card in idle) */}
            {inspectedCard && !isSpinning && (
              <div className="mb-2 px-4 py-2 rounded-xl bg-[#0b101b]/92 border border-amber-400/30 text-center max-w-sm shadow-lg">
                <div className="text-xs font-semibold text-amber-300">
                  {inspectedCard.symbol === 'MULTIPLIER'
                    ? `${inspectedCard.multiplier}× Foil Multiplier`
                    : SYMBOL_METADATA[inspectedCard.symbol].name}
                </div>
                <div className="text-[11px] text-stone-300 mt-0.5">
                  {SYMBOL_METADATA[inspectedCard.symbol].description}
                </div>
              </div>
            )}

            {/* Collapse / Expand Toggle */}
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setDockCollapsed((v) => !v);
              }}
              aria-label={dockCollapsed ? 'Show controls' : 'Hide controls'}
              className="pointer-events-auto mb-1.5 px-3 py-1 min-h-[28px] rounded-lg bg-[#0b101b]/85 border border-white/10 text-[11px] text-stone-400 hover:text-stone-200 flex items-center gap-1 transition-colors cursor-pointer"
            >
              {dockCollapsed ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Show Controls</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Hide Controls</span>
                </>
              )}
            </button>

            {/* Unified Bottom Dock */}
            {!dockCollapsed && (
              <div className="pointer-events-auto w-full max-w-[780px] px-3 sm:px-4 py-2.5 rounded-2xl bg-[#0b101b]/92 border border-amber-400/22 shadow-2xl flex items-center justify-between gap-2 sm:gap-4">
                {/* Bet Selector */}
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleStepBet(-1)}
                    disabled={isSpinning || freeSpinsLeft > 0 || betIndex === 0}
                    aria-label="Decrease bet"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-35 text-stone-200 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Minus className="w-4 h-4" />
                  </button>

                  <div className="min-w-[66px] sm:min-w-[76px] text-center">
                    <div className="text-[10px] uppercase tracking-wider text-stone-400 leading-none">
                      Bet
                    </div>
                    <div className="font-mono-num text-sm sm:text-base font-bold text-amber-300 mt-1 leading-none">
                      ${currentBet}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleStepBet(1)}
                    disabled={
                      isSpinning ||
                      freeSpinsLeft > 0 ||
                      betIndex === BET_STEPS.length - 1
                    }
                    aria-label="Increase bet"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-35 text-stone-200 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Primary Spin / Refill CTA + Auto */}
                <div className="flex items-center gap-2">
                  {needsRefill ? (
                    <button
                      type="button"
                      onClick={handleRefill}
                      className="min-h-[48px] px-5 sm:px-7 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-stone-950 font-bold text-sm sm:text-base flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Refill $1,000</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void executeSpin()}
                      disabled={!canSpin}
                      className="min-h-[48px] px-6 sm:px-9 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/40 active:scale-[0.98] text-stone-950 font-bold text-sm sm:text-base tracking-wide flex items-center gap-2 shadow-lg shadow-amber-500/25 transition-all cursor-pointer disabled:cursor-not-allowed"
                    >
                      <RotateCw
                        className={`w-4 h-4 ${isSpinning ? 'animate-spin' : ''}`}
                      />
                      <span>
                        {freeSpinsLeft > 0
                          ? 'Free Spin'
                          : isSpinning
                            ? 'Dealing'
                            : 'Spin'}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playClick();
                      setAutoPlay((v) => !v);
                    }}
                    aria-label="Toggle auto spin"
                    aria-pressed={autoPlay}
                    title="Auto Spin"
                    className={`min-w-[44px] min-h-[48px] px-3 flex items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      autoPlay
                        ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                        : 'bg-white/5 border-white/12 text-stone-300 hover:text-white'
                    }`}
                  >
                    <Repeat className="w-4 h-4" />
                    <span className="hidden sm:inline">Auto</span>
                  </button>
                </div>

                {/* Last Win Readout */}
                <div className="hidden sm:block text-right min-w-[92px]">
                  <div className="text-[10px] uppercase tracking-wider text-stone-400 leading-none">
                    Last Win
                  </div>
                  <div
                    className={`font-mono-num text-sm sm:text-base font-bold mt-1 leading-none ${
                      lastWin > 0 ? 'text-emerald-300' : 'text-stone-400'
                    }`}
                  >
                    ${displayWin.toFixed(2)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Paytable & Rules Modal */}
      {showPaytable && (
        <PaytableModal
          bet={currentBet}
          onClose={() => {
            soundEngine.playClick();
            setShowPaytable(false);
          }}
        />
      )}
    </div>
  );
}
