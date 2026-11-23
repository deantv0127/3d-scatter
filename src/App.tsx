import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  ChevronDown,
  ChevronUp,
  Gift,
  HelpCircle,
  LogIn,
  LogOut,
  Mic,
  MicOff,
  Minus,
  Music,
  Plus,
  RefreshCw,
  Repeat,
  RotateCw,
  Settings,
  UserCheck,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import { AuthModal } from './components/AuthModal';
import { DailyBonusModal } from './components/DailyBonusModal';
import { FreeSpinSummaryModal } from './components/FreeSpinSummaryModal';
import { PaytableModal } from './components/PaytableModal';
import { TitleOverlay } from './components/TitleOverlay';
import { auth } from './firebase';
import { soundEngine } from './game/audio';
import { CardSlotStage } from './game/CardSlotStage';
import {
  claimDailyLoginBonus,
  DAILY_BONUS_COOLDOWN_MS,
  ensurePlayerVault,
  getDailyBonusStatus,
  PlayerVaultProfile,
  syncPlayerVault,
  updatePlayerDisplayName,
} from './game/playerVault';
import { resolveSpinOutcome } from './game/slotEngine';
import {
  BET_STEPS,
  CardCellData,
  CASCADE_MULTIPLIER_TIERS,
  CascadeTierMultiplier,
  SYMBOL_METADATA,
} from './game/types';

type GamePhase = 'title' | 'playing';

interface WinBannerState {
  visible: boolean;
  label: string;
  amount: number;
  isBig: boolean;
}

function formatBonusCountdown(msRemaining: number): string {
  const totalMinutes = Math.max(1, Math.ceil(msRemaining / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
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
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [showPaytable, setShowPaytable] = useState<boolean>(false);
  const [contextLost, setContextLost] = useState<boolean>(false);

  // Firebase Auth & Cloud Player Vault
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [playerProfile, setPlayerProfile] = useState<PlayerVaultProfile | null>(null);
  const [authModal, setAuthModal] = useState<{
    open: boolean;
    mode: 'login' | 'signup';
  }>({ open: false, mode: 'login' });
  const [dailyBonusAward, setDailyBonusAward] = useState<{
    amount: number;
    streak: number;
  } | null>(null);
  const [menuNowMs, setMenuNowMs] = useState<number>(() => Date.now());
  const [fatalError, setFatalError] = useState<Error | null>(null);

  // Grid Window Cascade Multiplier Progression (2x, 3x, 4x, 6x, 10x)
  const [activeCascadeIndex, setActiveCascadeIndex] = useState<number>(-1);

  // 10 Free Spins Scatter Bonus & Deferred Pot Accumulation
  const [freeSpinsLeft, setFreeSpinsLeft] = useState<number>(0);
  const [freeSpinPot, setFreeSpinPot] = useState<number>(0);
  const [freeSpinSummary, setFreeSpinSummary] = useState<{
    totalWin: number;
    spinsPlayed: number;
  } | null>(null);

  // Live Win & Cascade Callouts
  const [lastWin, setLastWin] = useState<number>(0);
  const [displayWin, setDisplayWin] = useState<number>(0);
  const [winBanner, setWinBanner] = useState<WinBannerState>({
    visible: false,
    label: '',
    amount: 0,
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
    showPaytable,
    freeSpinSummary,
    authModalOpen: authModal.open,
    dailyBonusOpen: dailyBonusAward !== null,
  });
  stateRef.current = {
    phase,
    balance,
    betIndex,
    isSpinning,
    turboMode,
    autoPlay,
    freeSpinsLeft,
    showPaytable,
    freeSpinSummary,
    authModalOpen: authModal.open,
    dailyBonusOpen: dailyBonusAward !== null,
  };

  const userRef = useRef<User | null>(null);
  const pendingDisplayNameRef = useRef<string>('');
  const hadSignedInRef = useRef<boolean>(false);
  const claimingDailyRef = useRef<boolean>(false);
  const balanceRef = useRef<number>(2500);
  const statsRef = useRef<{
    totalSpins: number;
    totalWon: number;
    biggestWin: number;
  }>({ totalSpins: 0, totalWon: 0, biggestWin: 0 });
  const freeSpinsLeftRef = useRef<number>(0);
  const freeSpinPotRef = useRef<number>(0);
  const freeSpinsPlayedRef = useRef<number>(0);
  const bonusCollectedRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const inspectTimeoutRef = useRef<number | null>(null);
  const winAnimRef = useRef<number | null>(null);
  const prevBalanceRef = useRef<number>(2500);
  const [balancePop, setBalancePop] = useState<{
    seq: number;
    dir: 'up' | 'down';
  } | null>(null);

  useEffect(() => {
    const prev = prevBalanceRef.current;
    if (Math.abs(balance - prev) > 0.001) {
      const dir = balance > prev ? 'up' : 'down';
      prevBalanceRef.current = balance;
      setBalancePop((curr) => ({ seq: (curr?.seq ?? 0) + 1, dir }));
    }
  }, [balance]);

  if (fatalError) {
    throw fatalError;
  }

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
        soundEngine.announceMultiplier(tierMultiplier);
        setWinBanner({
          visible: true,
          label: `Cascade ${stepIndex + 1} · ${tierMultiplier}× Grid`,
          amount: runningWin,
          isBig: false,
        });
      },
      onContextLostChange: (lost) => {
        setContextLost(lost);
      },
    });

    stageRef.current = stage;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (inspectTimeoutRef.current) {
        window.clearTimeout(inspectTimeoutRef.current);
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

  useEffect(() => {
    soundEngine.setFreeSpinMood(freeSpinsLeft > 0 || freeSpinSummary !== null);
  }, [freeSpinsLeft, freeSpinSummary]);

  const persistVaultState = useCallback(
    (override?: Partial<PlayerVaultProfile>) => {
      const currentUser = userRef.current;
      if (!currentUser) return;

      const patch = {
        balance: override?.balance ?? balanceRef.current,
        freeSpinsLeft: override?.freeSpinsLeft ?? freeSpinsLeftRef.current,
        freeSpinPot: override?.freeSpinPot ?? freeSpinPotRef.current,
        freeSpinsPlayed: override?.freeSpinsPlayed ?? freeSpinsPlayedRef.current,
        totalSpins: override?.totalSpins ?? statsRef.current.totalSpins,
        totalWon: override?.totalWon ?? statsRef.current.totalWon,
        biggestWin: override?.biggestWin ?? statsRef.current.biggestWin,
      };

      setPlayerProfile((prev) => (prev ? { ...prev, ...patch } : prev));
      void syncPlayerVault(currentUser.uid, patch).catch((err) => {
        if (mountedRef.current) {
          setFatalError(
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      });
    },
    [],
  );

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!active) return;
      userRef.current = nextUser;
      setUser(nextUser);

      if (!nextUser) {
        setPlayerProfile(null);
        setDailyBonusAward(null);
        setAuthLoading(false);
        if (hadSignedInRef.current) {
          hadSignedInRef.current = false;
          balanceRef.current = 2500;
          setBalance(2500);
          freeSpinsLeftRef.current = 0;
          freeSpinPotRef.current = 0;
          freeSpinsPlayedRef.current = 0;
          statsRef.current = { totalSpins: 0, totalWon: 0, biggestWin: 0 };
          setFreeSpinsLeft(0);
          setFreeSpinPot(0);
          setFreeSpinSummary(null);
          setActiveCascadeIndex(-1);
          setBonusBannerText(null);
          setWinBanner({
            visible: false,
            label: '',
            amount: 0,
            isBig: false,
          });
          setLastWin(0);
          setDisplayWin(0);
        }
        return;
      }

      hadSignedInRef.current = true;
      try {
        const { profile, isNewAccount } = await ensurePlayerVault(nextUser, {
          balance: balanceRef.current,
          freeSpinsLeft: freeSpinsLeftRef.current,
          freeSpinPot: freeSpinPotRef.current,
          freeSpinsPlayed: freeSpinsPlayedRef.current,
        });
        if (!active) return;
        const chosenName = pendingDisplayNameRef.current.trim();
        pendingDisplayNameRef.current = '';
        if (isNewAccount && chosenName && profile.displayName !== chosenName) {
          profile.displayName = chosenName;
          void updatePlayerDisplayName(nextUser.uid, chosenName);
        }
        setPlayerProfile(profile);
        statsRef.current = {
          totalSpins: profile.totalSpins,
          totalWon: profile.totalWon,
          biggestWin: profile.biggestWin,
        };

        if (!isNewAccount) {
          balanceRef.current = profile.balance;
          setBalance(profile.balance);
          freeSpinsLeftRef.current = profile.freeSpinsLeft;
          freeSpinPotRef.current = profile.freeSpinPot;
          freeSpinsPlayedRef.current = profile.freeSpinsPlayed;
          setFreeSpinsLeft(profile.freeSpinsLeft);
          setFreeSpinPot(profile.freeSpinPot);
          if (profile.freeSpinsLeft === 0 && profile.freeSpinPot > 0) {
            bonusCollectedRef.current = false;
            setFreeSpinSummary({
              totalWin: profile.freeSpinPot,
              spinsPlayed: Math.max(1, profile.freeSpinsPlayed),
            });
          }
        }

        const bonusDue =
          profile.lastDailyBonusAtMs === null ||
          Date.now() - profile.lastDailyBonusAtMs >= DAILY_BONUS_COOLDOWN_MS;

        if (bonusDue && !claimingDailyRef.current) {
          claimingDailyRef.current = true;
          try {
            const result = await claimDailyLoginBonus(nextUser.uid);
            if (!active) return;
            if (result.claimed && result.rewardAmount > 0) {
              const updatedBalance = stateRef.current.isSpinning
                ? Math.round((balanceRef.current + result.rewardAmount) * 100) / 100
                : result.newBalance;
              balanceRef.current = updatedBalance;
              setBalance(updatedBalance);
              setPlayerProfile((prev) =>
                prev
                  ? {
                      ...prev,
                      balance: updatedBalance,
                      dailyBonusStreak: result.streak,
                      lastDailyBonusAtMs: result.lastDailyBonusAtMs,
                    }
                  : prev,
              );
              soundEngine.playBonusTrigger();
              setDailyBonusAward({
                amount: result.rewardAmount,
                streak: result.streak,
              });
            }
          } finally {
            claimingDailyRef.current = false;
          }
        }
      } catch (err) {
        if (active) {
          setFatalError(
            err instanceof Error ? err : new Error(String(err)),
          );
        }
      } finally {
        if (active) setAuthLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
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
    if (
      s.isSpinning ||
      s.phase !== 'playing' ||
      s.showPaytable ||
      s.freeSpinSummary !== null ||
      s.authModalOpen ||
      s.dailyBonusOpen
    ) {
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;

    const bet = BET_STEPS[s.betIndex];
    const inFreeSpin = freeSpinsLeftRef.current > 0;

    if (!inFreeSpin && balanceRef.current < bet) {
      setAutoPlay(false);
      return;
    }

    soundEngine.unlock();
    soundEngine.startMusic();
    setIsSpinning(true);
    setActiveCascadeIndex(-1);
    setInspectedCard(null);
    setBonusBannerText(null);
    setWinBanner({
      visible: false,
      label: '',
      amount: 0,
      isBig: false,
    });

    if (inFreeSpin) {
      freeSpinsLeftRef.current = Math.max(0, freeSpinsLeftRef.current - 1);
      setFreeSpinsLeft(freeSpinsLeftRef.current);
      freeSpinsPlayedRef.current += 1;
    } else {
      const debited = Math.round((balanceRef.current - bet) * 100) / 100;
      balanceRef.current = debited;
      setBalance(debited);
    }

    statsRef.current.totalSpins += 1;

    const outcome = resolveSpinOutcome(bet, inFreeSpin);

    await stage.playSpinSequence(outcome, s.turboMode);
    if (!mountedRef.current) return;

    if (outcome.awardedFreeSpins > 0) {
      if (!inFreeSpin) {
        freeSpinPotRef.current = 0;
        setFreeSpinPot(0);
        freeSpinsPlayedRef.current = 0;
      }
      freeSpinsLeftRef.current += outcome.awardedFreeSpins;
      setFreeSpinsLeft(freeSpinsLeftRef.current);
      setBonusBannerText(
        inFreeSpin
          ? `Scatter Retrigger · +${outcome.awardedFreeSpins} Free Spins`
          : `Scatter Bonus · ${outcome.awardedFreeSpins} Free Spins`,
      );
      soundEngine.announceBonus(outcome.awardedFreeSpins);
    }

    if (outcome.totalWin > 0) {
      const isBig = outcome.totalWin >= bet * 10;
      setLastWin(outcome.totalWin);
      animateWinCounter(outcome.totalWin);

      statsRef.current.totalWon =
        Math.round((statsRef.current.totalWon + outcome.totalWin) * 100) / 100;
      statsRef.current.biggestWin = Math.max(
        statsRef.current.biggestWin,
        outcome.totalWin,
      );

      if (inFreeSpin) {
        // Defer crediting balance during Free Spins; sum into the Bonus Pot instead
        const updatedPot =
          Math.round((freeSpinPotRef.current + outcome.totalWin) * 100) / 100;
        freeSpinPotRef.current = updatedPot;
        setFreeSpinPot(updatedPot);
        setWinBanner({
          visible: true,
          label: isBig ? 'Bonus Pot · Sovereign Hit' : 'Added to Bonus Pot',
          amount: outcome.totalWin,
          isBig,
        });
      } else {
        const credited =
          Math.round((balanceRef.current + outcome.totalWin) * 100) / 100;
        balanceRef.current = credited;
        setBalance(credited);
        setWinBanner({
          visible: true,
          label: isBig ? 'Sovereign Win' : 'Total Win',
          amount: outcome.totalWin,
          isBig,
        });
      }
    } else {
      setLastWin(0);
      setDisplayWin(0);
    }

    persistVaultState();

    // If this was the final Free Spin (and no retrigger remained), show the roll-up summary
    if (inFreeSpin && freeSpinsLeftRef.current === 0) {
      const pauseMs = outcome.totalWin > 0 ? 550 : 250;
      await new Promise((resolve) => window.setTimeout(resolve, pauseMs));
      if (!mountedRef.current) return;
      bonusCollectedRef.current = false;
      setFreeSpinSummary({
        totalWin: freeSpinPotRef.current,
        spinsPlayed: freeSpinsPlayedRef.current,
      });
    }

    setIsSpinning(false);
  }, [animateWinCounter, persistVaultState]);

  const handleCollectFreeSpinSummary = useCallback(() => {
    if (bonusCollectedRef.current) return;
    bonusCollectedRef.current = true;

    if (winAnimRef.current) {
      cancelAnimationFrame(winAnimRef.current);
      winAnimRef.current = null;
    }

    const total = freeSpinPotRef.current;
    if (total > 0) {
      const credited = Math.round((balanceRef.current + total) * 100) / 100;
      balanceRef.current = credited;
      setBalance(credited);
      setLastWin(total);
      setDisplayWin(total);
      statsRef.current.biggestWin = Math.max(
        statsRef.current.biggestWin,
        total,
      );
    }

    freeSpinPotRef.current = 0;
    freeSpinsPlayedRef.current = 0;
    setFreeSpinPot(0);
    setFreeSpinSummary(null);
    setBonusBannerText(null);
    setWinBanner({
      visible: false,
      label: '',
      amount: 0,
      isBig: false,
    });

    persistVaultState();
  }, [persistVaultState]);

  useEffect(() => {
    if (
      isSpinning ||
      phase !== 'playing' ||
      showPaytable ||
      freeSpinSummary !== null ||
      authModal.open ||
      dailyBonusAward !== null
    ) {
      return;
    }
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
    freeSpinSummary,
    authModal.open,
    dailyBonusAward,
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
      if (s.freeSpinSummary !== null || s.authModalOpen || s.dailyBonusOpen) {
        return;
      }
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
        setSettingsOpen(false);
        setShowPaytable(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [executeSpin, handleStartGame]);

  useEffect(() => {
    if (!settingsOpen) return;
    setMenuNowMs(Date.now());
    const interval = window.setInterval(() => {
      setMenuNowMs(Date.now());
    }, 30000);
    const onPointerDown = (e: PointerEvent) => {
      if (
        settingsMenuRef.current &&
        !settingsMenuRef.current.contains(e.target as Node)
      ) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [settingsOpen]);

  const handleToggleMute = () => {
    setMuted(soundEngine.toggleMute());
  };

  const handleToggleMusic = () => {
    setMusicEnabled(soundEngine.toggleMusic());
  };

  const handleToggleVoice = () => {
    setVoiceEnabled(soundEngine.toggleVoice());
  };

  const handleClaimDailyBonus = useCallback(async () => {
    soundEngine.playClick();
    setSettingsOpen(false);

    const currentUser = userRef.current;
    if (!currentUser) {
      setAuthModal({ open: true, mode: 'login' });
      return;
    }

    if (claimingDailyRef.current) return;
    claimingDailyRef.current = true;
    try {
      const result = await claimDailyLoginBonus(currentUser.uid);
      if (!mountedRef.current) return;
      if (result.claimed && result.rewardAmount > 0) {
        const updatedBalance = stateRef.current.isSpinning
          ? Math.round((balanceRef.current + result.rewardAmount) * 100) / 100
          : result.newBalance;
        balanceRef.current = updatedBalance;
        setBalance(updatedBalance);
        setPlayerProfile((prev) =>
          prev
            ? {
                ...prev,
                balance: updatedBalance,
                dailyBonusStreak: result.streak,
                lastDailyBonusAtMs: result.lastDailyBonusAtMs,
              }
            : prev,
        );
        soundEngine.playBonusTrigger();
        setDailyBonusAward({
          amount: result.rewardAmount,
          streak: result.streak,
        });
      }
    } catch (err) {
      if (mountedRef.current) {
        setFatalError(
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    } finally {
      claimingDailyRef.current = false;
    }
  }, []);

  const handleLogout = useCallback(async () => {
    soundEngine.playClick();
    setAutoPlay(false);
    setSettingsOpen(false);
    setDailyBonusAward(null);
    setAuthModal((prev) => ({ ...prev, open: false }));
    try {
      await signOut(auth);
    } catch (err) {
      if (mountedRef.current) {
        setFatalError(
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }
  }, []);

  const handleStepBet = (dir: -1 | 1) => {
    if (isSpinning || freeSpinsLeft > 0 || freeSpinSummary !== null) return;
    soundEngine.playClick();
    setBetIndex((prev) =>
      Math.max(0, Math.min(BET_STEPS.length - 1, prev + dir)),
    );
  };

  const handleRefill = () => {
    soundEngine.unlock();
    soundEngine.playMultiplierHit(5);
    const refilled = Math.round((balanceRef.current + 1000) * 100) / 100;
    balanceRef.current = refilled;
    setBalance(refilled);
    persistVaultState({ balance: refilled });
  };

  const canSpin =
    !isSpinning &&
    freeSpinSummary === null &&
    !authModal.open &&
    dailyBonusAward === null &&
    (freeSpinsLeft > 0 || balance >= currentBet);
  const needsRefill =
    !isSpinning &&
    freeSpinSummary === null &&
    !authModal.open &&
    dailyBonusAward === null &&
    freeSpinsLeft === 0 &&
    balance < currentBet;

  const dailyBonusStatus = playerProfile
    ? getDailyBonusStatus(
        playerProfile.lastDailyBonusAtMs,
        playerProfile.dailyBonusStreak,
        menuNowMs,
      )
    : null;

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
      {phase === 'title' && (
        <TitleOverlay
          onStart={handleStartGame}
          user={user}
          profile={playerProfile}
          authLoading={authLoading}
          onOpenAuth={(mode) => {
            soundEngine.playClick();
            setAuthModal({ open: true, mode });
          }}
          onLogout={() => void handleLogout()}
        />
      )}

      {/* Active Game HUD */}
      {phase === 'playing' && (
        <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between">
          {/* Top Compact Perimeter Bar + Premium Grid Multiplier Indicator */}
          <div className="pt-safe px-3 sm:px-6 pt-2 flex flex-col items-center gap-2">
            <header className="w-full flex items-center justify-between gap-2 sm:gap-3">
              {/* Balance, Mobile Win & Active Free Spins Readout */}
              <div className="pointer-events-auto flex items-center gap-2.5 sm:gap-4 px-3 py-2 rounded-xl bg-[#0b101b]/92 border border-amber-400/20 shadow-lg">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-stone-400 leading-none">
                    Balance
                  </div>
                  <motion.div
                    key={balancePop?.seq ?? 0}
                    initial={balancePop ? { scale: 1 } : false}
                    animate={
                      balancePop
                        ? balancePop.dir === 'up'
                          ? {
                              scale: [1, 1.16, 1],
                              color: ['#f5f5f4', '#6ee7b7', '#f5f5f4'],
                            }
                          : { scale: [1, 0.96, 1] }
                        : undefined
                    }
                    transition={{
                      duration: balancePop?.dir === 'up' ? 0.38 : 0.22,
                      times: balancePop?.dir === 'up' ? [0, 0.35, 1] : [0, 0.4, 1],
                      ease: 'easeOut',
                    }}
                    className="origin-left font-mono-num text-sm sm:text-base font-bold text-stone-100 mt-1 leading-none inline-block"
                  >
                    ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </motion.div>
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

                {(freeSpinsLeft > 0 || freeSpinSummary !== null) && (
                  <>
                    <div className="h-6 w-px bg-white/15" aria-hidden="true" />
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-fuchsia-300 leading-none">
                        Free Spins
                      </div>
                      <div className="font-mono-num text-sm sm:text-base font-bold text-fuchsia-200 mt-1 leading-none">
                        {freeSpinsLeft} left
                      </div>
                    </div>
                    <div className="h-6 w-px bg-white/15" aria-hidden="true" />
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-amber-300/90 leading-none">
                        Bonus Pot
                      </div>
                      <div className="font-mono-num text-sm sm:text-base font-bold text-amber-300 mt-1 leading-none">
                        ${freeSpinPot.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Compact Settings Dropdown Trigger (>= 44px touch target) */}
              <div
                ref={settingsMenuRef}
                className="pointer-events-auto relative shrink-0"
              >
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setSettingsOpen((v) => !v);
                  }}
                  aria-label="Open settings menu"
                  aria-expanded={settingsOpen}
                  aria-haspopup="menu"
                  className={`min-w-[44px] min-h-[44px] px-3 flex items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                    settingsOpen
                      ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                      : 'bg-[#0b101b]/92 border-amber-400/25 text-stone-200 hover:border-amber-400/50 hover:text-white'
                  }`}
                >
                  <Settings className="w-4 h-4 text-amber-300" />
                  <span className="hidden sm:inline">Menu</span>
                </button>

                {settingsOpen && (
                  <div
                    role="menu"
                    aria-label="Game settings and account"
                    className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-[#0c111b] border border-amber-400/35 shadow-2xl p-2 space-y-1 z-30"
                  >
                    {/* Account / Vault */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        soundEngine.playClick();
                        setSettingsOpen(false);
                        setAuthModal({ open: true, mode: 'login' });
                      }}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white/8 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        {user ? (
                          <UserCheck className="w-4 h-4 text-emerald-300 shrink-0" />
                        ) : (
                          <LogIn className="w-4 h-4 text-amber-300 shrink-0" />
                        )}
                        <span className="text-xs font-semibold text-stone-100 truncate">
                          {user
                            ? playerProfile?.displayName ||
                              user.displayName ||
                              'Player Vault'
                            : 'Log In / Sign Up'}
                        </span>
                      </span>
                      <span className="text-[11px] font-medium text-amber-300 shrink-0">
                        {user ? 'Vault' : 'Account'}
                      </span>
                    </button>

                    {/* Daily Login Bonus */}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={Boolean(user && dailyBonusStatus && !dailyBonusStatus.eligible)}
                      onClick={() => void handleClaimDailyBonus()}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white/8 disabled:hover:bg-transparent flex items-center justify-between gap-2 text-left transition-colors cursor-pointer disabled:cursor-default"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Gift
                          className={`w-4 h-4 shrink-0 ${
                            !user || dailyBonusStatus?.eligible
                              ? 'text-amber-300'
                              : 'text-stone-400'
                          }`}
                        />
                        <span className="text-xs font-medium text-stone-200 truncate">
                          Daily Bonus
                        </span>
                      </span>
                      {!user ? (
                        <span className="text-[11px] font-medium text-amber-300 shrink-0">
                          Sign in
                        </span>
                      ) : dailyBonusStatus?.eligible ? (
                        <span className="font-mono-num text-[11px] font-bold text-emerald-300 shrink-0">
                          Claim +${dailyBonusStatus.rewardAmount}
                        </span>
                      ) : (
                        <span className="font-mono-num text-[11px] text-stone-400 shrink-0">
                          {dailyBonusStatus
                            ? `In ${formatBonusCountdown(dailyBonusStatus.msRemaining)}`
                            : 'Claimed'}
                        </span>
                      )}
                    </button>

                    <div className="my-1 border-t border-white/10" />

                    {/* Turbo Mode */}
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={turboMode}
                      onClick={() => {
                        soundEngine.playClick();
                        setTurboMode((v) => !v);
                      }}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white/8 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5 text-xs font-medium text-stone-200">
                        <Zap
                          className={`w-4 h-4 ${
                            turboMode ? 'text-amber-300' : 'text-stone-400'
                          }`}
                        />
                        <span>Turbo Spin</span>
                      </span>
                      <span
                        className={`text-[11px] font-semibold ${
                          turboMode ? 'text-amber-300' : 'text-stone-500'
                        }`}
                      >
                        {turboMode ? 'On' : 'Off'}
                      </span>
                    </button>

                    {/* Background Music */}
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={musicEnabled && !muted}
                      onClick={handleToggleMusic}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white/8 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5 text-xs font-medium text-stone-200">
                        <Music
                          className={`w-4 h-4 ${
                            musicEnabled && !muted
                              ? 'text-amber-300'
                              : 'text-stone-400'
                          }`}
                        />
                        <span>Casino Music</span>
                      </span>
                      <span
                        className={`text-[11px] font-semibold ${
                          musicEnabled && !muted
                            ? 'text-amber-300'
                            : 'text-stone-500'
                        }`}
                      >
                        {musicEnabled ? 'On' : 'Off'}
                      </span>
                    </button>

                    {/* Voice Announcer */}
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={voiceEnabled && !muted}
                      onClick={handleToggleVoice}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white/8 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5 text-xs font-medium text-stone-200">
                        {voiceEnabled && !muted ? (
                          <Mic className="w-4 h-4 text-amber-300" />
                        ) : (
                          <MicOff className="w-4 h-4 text-stone-400" />
                        )}
                        <span>Voice Callouts</span>
                      </span>
                      <span
                        className={`text-[11px] font-semibold ${
                          voiceEnabled && !muted
                            ? 'text-amber-300'
                            : 'text-stone-500'
                        }`}
                      >
                        {voiceEnabled ? 'On' : 'Off'}
                      </span>
                    </button>

                    {/* Master Sound / Mute */}
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={!muted}
                      onClick={handleToggleMute}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white/8 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5 text-xs font-medium text-stone-200">
                        {muted ? (
                          <VolumeX className="w-4 h-4 text-rose-400" />
                        ) : (
                          <Volume2 className="w-4 h-4 text-emerald-300" />
                        )}
                        <span>Master Audio</span>
                      </span>
                      <span
                        className={`text-[11px] font-semibold ${
                          muted ? 'text-rose-400' : 'text-emerald-300'
                        }`}
                      >
                        {muted ? 'Muted' : 'Active'}
                      </span>
                    </button>

                    <div className="my-1 border-t border-white/10" />

                    {/* Paytable & Rules */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        soundEngine.playClick();
                        setSettingsOpen(false);
                        setShowPaytable(true);
                      }}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-white/8 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5 text-xs font-medium text-stone-200">
                        <HelpCircle className="w-4 h-4 text-amber-300" />
                        <span>Paytable & Rules</span>
                      </span>
                      <span className="text-[11px] text-stone-400">View</span>
                    </button>

                    {user && (
                      <>
                        <div className="my-1 border-t border-white/10" />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void handleLogout()}
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl hover:bg-rose-500/15 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
                        >
                          <span className="flex items-center gap-2.5 text-xs font-semibold text-rose-200">
                            <LogOut className="w-4 h-4 text-rose-300" />
                            <span>Log Out</span>
                          </span>
                          <span className="text-[11px] text-rose-300/80">
                            Sign out
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </header>

            {/* Luxury Cabinet Multiplier Indicator Above Grid Window */}
            <div
              className="w-full max-w-[500px] rounded-2xl bg-gradient-to-b from-[#151d2e] to-[#0a0f19] border border-amber-400/40 shadow-[0_12px_32px_rgba(0,0,0,0.65)] p-2"
              aria-label="Cascade multiplier status indicator"
            >
              <div className="flex items-center justify-between px-1.5 pb-1.5 border-b border-amber-400/15">
                <span className="font-display text-[11px] sm:text-xs font-bold tracking-[0.18em] uppercase text-amber-200/90">
                  Cascade Multiplier
                </span>
                <span className="font-mono-num text-xs font-bold text-amber-300">
                  {activeGridTierMult > 1 ? `${activeGridTierMult}× Active` : '1× Ready'}
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
                  {SYMBOL_METADATA[inspectedCard.symbol].name}
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

      {/* Free Spins Total Win Roll-Up Summary */}
      {freeSpinSummary !== null && (
        <FreeSpinSummaryModal
          totalWin={freeSpinSummary.totalWin}
          spinsPlayed={freeSpinSummary.spinsPlayed}
          onCollect={handleCollectFreeSpinSummary}
        />
      )}

      {/* Account Login / Sign Up / Vault Modal */}
      {authModal.open && (
        <AuthModal
          user={user}
          profile={playerProfile}
          initialMode={authModal.mode}
          onPrepareSignupName={(name) => {
            pendingDisplayNameRef.current = name;
          }}
          onClose={() => {
            soundEngine.playClick();
            setAuthModal((prev) => ({ ...prev, open: false }));
          }}
        />
      )}

      {/* Daily Login Bonus Celebration Modal */}
      {dailyBonusAward !== null && (
        <DailyBonusModal
          rewardAmount={dailyBonusAward.amount}
          streak={dailyBonusAward.streak}
          onClose={() => setDailyBonusAward(null)}
        />
      )}
    </div>
  );
}
