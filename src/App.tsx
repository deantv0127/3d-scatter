import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Mic,
  MicOff,
  Minus,
  Music,
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
  CASCADE_MULTIPLIER_TIERS,
  CascadeTierMultiplier,
  MultiplierValue,
  SYMBOL_METADATA,
} from './game/types';

type GamePhase = 'title' | 'playing';

interface WinBannerState {
  visible: boolean;
  label: string;
  amount: number;
  extraMultiplier: number;
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
  const [musicEnabled, setMusicEnabled] = useState<boolean>(true);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [showPaytable, setShowPaytable] = useState<boolean>(false);
  const [contextLost, setContextLost] = useState<boolean>(false);

  // Grid Window Cascade Multiplier Progression (2x, 3x, 4x, 6x, 10x)
  const [activeCascadeIndex, setActiveCascadeIndex] = useState<number>(-1);
  const [activeFoilBoost, setActiveFoilBoost] = useState<number>(1);

  // Free Spins & Foil Multiplier Progression
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
    extraMultiplier: 1,
    isBig: false,
  });
  const [bonusBannerText, setBonusBannerText] = useState<string | null>(null);
  const [inspectedCard, setInspectedCard] = useState<CardCellData | null>(null);

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
  const voiceTimeoutRef = useRef<number | null>(null);

  const currentBet = BET_STEPS[betIndex];

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
      onCascadeStep: (
        stepIndex: number,
        tierMultiplier: CascadeTierMultiplier,
        _stepWin: number,
        runningWin: number,
      ) => {
        setActiveCascadeIndex(stepIndex);
        soundEngine.announceMultiplier(tierMultiplier, tierMultiplier === 10);
        setWinBanner({
          visible: true,
          label: `Cascade ${stepIndex + 1} · ${tierMultiplier}× Grid`,
          amount: runningWin,
          extraMultiplier: 1,
          isBig: false,
        });
      },
      onMultiplierPulse: (value: MultiplierValue, totalExtraFactor: number) => {
        setActiveFoilBoost(totalExtraFactor);
        soundEngine.announceFoilMultiplier(totalExtraFactor);
        setWinBanner((prev) => ({
          ...prev,
          visible: true,
          label: `Foil Seal +${value}×`,
          extraMultiplier: totalExtraFactor,
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
      if (voiceTimeoutRef.current) {
        window.clearTimeout(voiceTimeoutRef.current);
      }
      if (winAnimRef.current) {
        cancelAnimationFrame(winAnimRef.current);
      }
      soundEngine.stopMusic();
      soundEngine.stopSpeech();
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  // Sync free spin mood for background slot music
  useEffect(() => {
    soundEngine.setFreeSpinMood(freeSpinsLeft > 0);
  }, [freeSpinsLeft]);

  const animateWinCounter = useCallback((target: number) => {
    if (winAnimRef.current) {
      cancelAnimationFrame(winAnimRef.current);
    }
    if (target <= 0) {
      setDisplayWin(0);
      return;
    }
    const duration = Math.min(900, Math.max(300, target * 6));
    const startTime = performance.now();
    let tickStep = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = target * eased;
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
    soundEngine.startMusic();
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

    if (voiceTimeoutRef.current) {
      window.clearTimeout(voiceTimeoutRef.current);
      voiceTimeoutRef.current = null;
    }

    soundEngine.unlock();
    soundEngine.startMusic();
    setIsSpinning(true);
    setActiveCascadeIndex(-1);
    setActiveFoilBoost(inFreeSpin && s.freeSpinGlobalMult > 0 ? s.freeSpinGlobalMult : 1);
    setInspectedCard(null);
    setBonusBannerText(null);
    setWinBanner({
      visible: false,
      label: '',
      amount: 0,
      extraMultiplier: 1,
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
        extraMultiplier: outcome.extraMultiplierFactor,
        isBig,
      });

      const effectivePeakMult =
        outcome.extraMultiplierFactor > 1
          ? outcome.peakTierMultiplier * outcome.extraMultiplierFactor
          : outcome.peakTierMultiplier;

      if (outcome.awardedFreeSpins === 0) {
        voiceTimeoutRef.current = window.setTimeout(() => {
          soundEngine.announceWin(outcome.totalWin, effectivePeakMult, isBig);
        }, 260);
      }

      if (inFreeSpin) {
        setFreeSpinRoundWin(
          (prev) => Math.round((prev + outcome.totalWin) * 100) / 100,
        );
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
      soundEngine.announceBonus(outcome.awardedFreeSpins, inFreeSpin);
      if (!inFreeSpin) {
        setFreeSpinGlobalMult(Math.max(1, outcome.boardMultiplierSum));
        setFreeSpinRoundWin(0);
      }
    } else if (inFreeSpin && s.freeSpinsLeft - 1 === 0) {
      setFreeSpinGlobalMult(0);
    }

    setIsSpinning(false);
  }, [animateWinCounter]);

  useEffect(() => {
    if (isSpinning || phase !== 'playing' || showPaytable) return;
    if (freeSpinsLeft > 0 || autoPlay) {
      const bet = BET_STEPS[betIndex];
      if (freeSpinsLeft === 0 && balance < bet) {
        setAutoPlay(false);
        return;
      }
      const delay = turboMode ? 320 : 640;
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

  const handleToggleMusic = () => {
    setMusicEnabled(soundEngine.toggleMusic());
  };

  const handleToggleVoice = () => {
    setVoiceEnabled(soundEngine.toggleVoice());
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

  const clampedTierIdx = Math.min(
    activeCascadeIndex,
    CASCADE_MULTIPLIER_TIERS.length - 1,
  );
  const activeGridTierMult =
    clampedTierIdx >= 0 ? CASCADE_MULTIPLIER_TIERS[clampedTierIdx] : 1;
  const progressPercent =
    clampedTierIdx >= 0
      ? ((clampedTierIdx + 1) / CASCADE_MULTIPLIER_TIERS.length) * 100
      : 0;

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
          {/* Top Compact Perimeter Bar + Premium Grid Multiplier Indicator */}
          <div className="pt-safe px-3 sm:px-6 pt-2 flex flex-col items-center gap-2">
            <header className="w-full flex items-center justify-between gap-2 sm:gap-3">
              {/* Balance, Mobile Win & Active Bonus Readout */}
              <div className="pointer-events-auto flex items-center gap-2.5 sm:gap-4 px-3 py-2 rounded-xl bg-[#0b101b]/92 border border-amber-400/20 shadow-lg">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-400 leading-none">
                    Balance
                  </div>
                  <div className="font-mono-num text-sm sm:text-base font-bold text-stone-100 mt-1 leading-none">
                    ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="sm:hidden flex items-center gap-2.5">
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
                        {freeSpinGlobalMult > 0 ? ` · +${freeSpinGlobalMult}×` : ''}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Right Utility & Audio Controls (>= 44px touch targets) */}
              <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5">
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
                      : 'bg-[#0b101b]/92 border-white/15 text-stone-300 hover:text-white'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  <span className="hidden md:inline">Turbo</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleMusic}
                  aria-label={musicEnabled ? 'Disable slot music' : 'Enable slot music'}
                  aria-pressed={musicEnabled}
                  title="Background Music"
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                    musicEnabled && !muted
                      ? 'bg-amber-500/15 border-amber-400/45 text-amber-300'
                      : 'bg-[#0b101b]/92 border-white/15 text-stone-500 hover:text-stone-300'
                  }`}
                >
                  <Music className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleToggleVoice}
                  aria-label={voiceEnabled ? 'Disable voice announcer' : 'Enable voice announcer'}
                  aria-pressed={voiceEnabled}
                  title="Voice Announcer"
                  className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                    voiceEnabled && !muted
                      ? 'bg-amber-500/15 border-amber-400/45 text-amber-300'
                      : 'bg-[#0b101b]/92 border-white/15 text-stone-500 hover:text-stone-300'
                  }`}
                >
                  {voiceEnabled && !muted ? (
                    <Mic className="w-4 h-4" />
                  ) : (
                    <MicOff className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setShowPaytable(true);
                  }}
                  aria-label="Open paytable and rules"
                  title="Paytable"
                  className="min-w-[44px] min-h-[44px] px-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-[#0b101b]/92 border border-white/15 text-stone-300 hover:text-white transition-colors cursor-pointer"
                >
                  <HelpCircle className="w-4 h-4" />
                  <span className="hidden md:inline text-xs font-medium">Rules</span>
                </button>

                <button
                  type="button"
                  onClick={handleToggleMute}
                  aria-label={muted ? 'Unmute all audio' : 'Mute all audio'}
                  title="Mute All (M)"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[#0b101b]/92 border border-white/15 text-stone-300 hover:text-white transition-colors cursor-pointer"
                >
                  {muted ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-emerald-300" />
                  )}
                </button>
              </div>
            </header>

            {/* Luxury Cabinet Multiplier Indicator Above Grid Window */}
            <div
              className="w-full max-w-[500px] rounded-2xl bg-gradient-to-b from-[#151d2e] to-[#0a0f19] border border-amber-400/40 shadow-[0_12px_32px_rgba(0,0,0,0.65)] p-2"
              aria-label="Cascade multiplier status indicator"
            >
              {/* Status Title & Active Multiplier Readout */}
              <div className="flex items-center justify-between px-1.5 pb-1.5 border-b border-amber-400/15">
                <span className="font-display text-[11px] sm:text-xs font-bold tracking-[0.18em] uppercase text-amber-200/90">
                  Multiplier Status
                </span>
                <span className="font-mono-num text-xs font-bold text-amber-300">
                  {activeGridTierMult > 1 ? (
                    <>
                      {activeGridTierMult}× Active
                      {activeFoilBoost > 1 ? ` · +${activeFoilBoost}× Foil` : ''}
                    </>
                  ) : freeSpinGlobalMult > 0 ? (
                    `Vault +${freeSpinGlobalMult}× Ready`
                  ) : (
                    '1× Ready'
                  )}
                </span>
              </div>

              {/* 5-Stage Illuminated Multiplier Rail: 2x, 3x, 4x, 6x, 10x */}
              <div className="grid grid-cols-5 gap-1.5 pt-1.5">
                {CASCADE_MULTIPLIER_TIERS.map((tier, idx) => {
                  const isCurrent = clampedTierIdx === idx;
                  const isPassed = clampedTierIdx > idx;
                  const isMax = tier === 10;
                  return (
                    <div
                      key={tier}
                      className={`relative rounded-xl py-1.5 px-1 text-center font-mono-num text-xs sm:text-sm font-bold border transition-transform duration-150 ${
                        isCurrent
                          ? 'bg-gradient-to-b from-amber-300 via-amber-400 to-amber-600 border-amber-200 text-stone-950 scale-[1.05] shadow-[0_0_18px_rgba(245,158,11,0.5)]'
                          : isPassed
                            ? 'bg-gradient-to-b from-amber-500/25 to-amber-600/15 border-amber-400/45 text-amber-200'
                            : isMax
                              ? 'bg-gradient-to-b from-[#1e1a12] to-[#110f0b] border-amber-500/30 text-amber-300/75'
                              : 'bg-gradient-to-b from-[#161e2e] to-[#0d121d] border-white/10 text-stone-400'
                      }`}
                    >
                      {tier}×
                    </div>
                  );
                })}
              </div>

              {/* Precision Progress Meter */}
              <div className="mt-1.5 h-1 w-full rounded-full bg-[#070a10] overflow-hidden border border-white/5">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 via-amber-300 to-yellow-200 transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Non-Blocking Upper Win / Bonus Callout Zone */}
          <div className="flex flex-col items-center justify-start pt-1 px-4 pointer-events-none">
            {bonusBannerText && (
              <div className="mb-1.5 px-4 py-1.5 rounded-xl bg-[#1f0c24]/92 border border-fuchsia-400/50 text-fuchsia-200 font-display text-xs sm:text-sm font-bold tracking-wider uppercase shadow-lg">
                {bonusBannerText}
              </div>
            )}

            {winBanner.visible && (
              <div
                className={`px-5 py-1.5 rounded-xl border shadow-xl text-center transition-transform duration-150 ${
                  winBanner.isBig
                    ? 'bg-[#241806]/94 border-amber-400/75'
                    : 'bg-[#0b101b]/94 border-amber-400/40'
                }`}
              >
                <div className="text-[11px] uppercase tracking-[0.18em] text-amber-300 font-semibold">
                  {winBanner.label}
                  {winBanner.extraMultiplier > 1
                    ? ` · ${winBanner.extraMultiplier}× Foil`
                    : ''}
                </div>
                <div className="font-mono-num text-lg sm:text-2xl font-bold text-white leading-tight mt-0.5">
                  +${winBanner.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Ergonomic Control Dock + Card Inspect Strip */}
          <div className="flex flex-col items-center pb-safe px-3 sm:px-5 pb-2.5">
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

                  <div className="min-w-[60px] sm:min-w-[74px] text-center">
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
