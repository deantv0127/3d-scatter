import { User } from 'firebase/auth';
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export const DAILY_BONUS_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const DAILY_BONUS_STREAK_RESET_MS = 48 * 60 * 60 * 1000;

export interface PlayerVaultProfile {
  uid: string;
  displayName: string;
  photoUrl?: string;
  balance: number;
  freeSpinsLeft: number;
  freeSpinPot: number;
  freeSpinsPlayed: number;
  totalSpins: number;
  totalWon: number;
  biggestWin: number;
  lastDailyBonusAtMs: number | null;
  dailyBonusStreak: number;
}

export interface PlayerVaultPatch {
  balance: number;
  freeSpinsLeft: number;
  freeSpinPot: number;
  freeSpinsPlayed: number;
  totalSpins: number;
  totalWon: number;
  biggestWin: number;
}

export interface DailyBonusStatus {
  eligible: boolean;
  msRemaining: number;
  nextStreak: number;
  rewardAmount: number;
}

export interface DailyBonusClaimResult {
  claimed: boolean;
  rewardAmount: number;
  newBalance: number;
  streak: number;
  lastDailyBonusAtMs: number | null;
}

function clampMoney(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(100000000, Math.round(val * 100) / 100));
}

function clampInt(val: number, max: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(max, Math.round(val)));
}

function sanitizeDisplayName(raw: string | null | undefined): string {
  const cleaned = (raw ?? '').trim().slice(0, 64);
  return cleaned.length > 0 ? cleaned : 'Player';
}

function sanitizePhotoUrl(raw: string | null | undefined): string | undefined {
  const cleaned = (raw ?? '').trim().slice(0, 512);
  return cleaned.length > 0 ? cleaned : undefined;
}

function extractMillis(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (raw && typeof raw === 'object') {
    const maybeTs = raw as { toMillis?: () => number; seconds?: number };
    if (typeof maybeTs.toMillis === 'function') {
      const ms = maybeTs.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof maybeTs.seconds === 'number' && Number.isFinite(maybeTs.seconds)) {
      return maybeTs.seconds * 1000;
    }
  }
  return null;
}

export function getDailyBonusStatus(
  lastClaimMs: number | null,
  currentStreak: number,
  nowMs: number = Date.now(),
): DailyBonusStatus {
  const safeStreak = clampInt(currentStreak, 10000);
  const elapsed = lastClaimMs === null ? Infinity : Math.max(0, nowMs - lastClaimMs);
  const eligible = lastClaimMs === null || elapsed >= DAILY_BONUS_COOLDOWN_MS;
  const msRemaining =
    lastClaimMs === null ? 0 : Math.max(0, DAILY_BONUS_COOLDOWN_MS - elapsed);

  const nextStreak =
    lastClaimMs === null || elapsed > DAILY_BONUS_STREAK_RESET_MS
      ? 1
      : Math.min(10000, safeStreak + 1);

  // Day 1: $150 -> Day 7+: $450 (strictly within <= 500 server rule cap)
  const tierIndex = Math.min(nextStreak, 7) - 1;
  const rewardAmount = Math.min(450, 150 + tierIndex * 50);

  return {
    eligible,
    msRemaining,
    nextStreak,
    rewardAmount,
  };
}

export async function ensurePlayerVault(
  user: User,
  seed?: {
    balance: number;
    freeSpinsLeft: number;
    freeSpinPot: number;
    freeSpinsPlayed: number;
  },
): Promise<{ profile: PlayerVaultProfile; isNewAccount: boolean }> {
  const path = `players/${user.uid}`;
  const ref = doc(db, 'players', user.uid);

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const displayName = sanitizeDisplayName(
    user.displayName || user.email?.split('@')[0],
  );
  const photoUrl = sanitizePhotoUrl(user.photoURL);

  if (snap.exists()) {
    const data = snap.data();
    const profile: PlayerVaultProfile = {
      uid: user.uid,
      displayName: sanitizeDisplayName(
        typeof data.displayName === 'string' ? data.displayName : displayName,
      ),
      photoUrl: sanitizePhotoUrl(
        typeof data.photoUrl === 'string' ? data.photoUrl : photoUrl,
      ),
      balance: clampMoney(Number(data.balance ?? 2500)),
      freeSpinsLeft: clampInt(Number(data.freeSpinsLeft ?? 0), 1000),
      freeSpinPot: clampMoney(Number(data.freeSpinPot ?? 0)),
      freeSpinsPlayed: clampInt(Number(data.freeSpinsPlayed ?? 0), 1000),
      totalSpins: clampInt(Number(data.totalSpins ?? 0), 1000000000),
      totalWon: clampMoney(Number(data.totalWon ?? 0)),
      biggestWin: clampMoney(Number(data.biggestWin ?? 0)),
      lastDailyBonusAtMs: extractMillis(data.lastDailyBonusAt),
      dailyBonusStreak: clampInt(Number(data.dailyBonusStreak ?? 0), 10000),
    };
    return { profile, isNewAccount: false };
  }

  const initialProfile: PlayerVaultProfile = {
    uid: user.uid,
    displayName,
    ...(photoUrl ? { photoUrl } : {}),
    balance: clampMoney(seed?.balance ?? 2500),
    freeSpinsLeft: clampInt(seed?.freeSpinsLeft ?? 0, 1000),
    freeSpinPot: clampMoney(seed?.freeSpinPot ?? 0),
    freeSpinsPlayed: clampInt(seed?.freeSpinsPlayed ?? 0, 1000),
    totalSpins: 0,
    totalWon: 0,
    biggestWin: 0,
    lastDailyBonusAtMs: null,
    dailyBonusStreak: 0,
  };

  try {
    const { lastDailyBonusAtMs: _omit, ...docFields } = initialProfile;
    await setDoc(ref, {
      ...docFields,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return { profile: initialProfile, isNewAccount: true };
}

export async function claimDailyLoginBonus(
  uid: string,
): Promise<DailyBonusClaimResult> {
  const path = `players/${uid}`;
  const ref = doc(db, 'players', uid);

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new Error('Player vault document not found.');
      }

      const data = snap.data();
      const currentBalance = clampMoney(Number(data.balance ?? 0));
      const currentStreak = clampInt(Number(data.dailyBonusStreak ?? 0), 10000);
      const lastClaimMs = extractMillis(data.lastDailyBonusAt);
      const nowMs = Date.now();
      const status = getDailyBonusStatus(lastClaimMs, currentStreak, nowMs);

      if (!status.eligible) {
        return {
          claimed: false,
          rewardAmount: 0,
          newBalance: currentBalance,
          streak: currentStreak,
          lastDailyBonusAtMs: lastClaimMs,
        };
      }

      const newBalance = clampMoney(currentBalance + status.rewardAmount);
      const actualReward = Math.max(
        0,
        Math.round((newBalance - currentBalance) * 100) / 100,
      );

      tx.update(ref, {
        balance: newBalance,
        lastDailyBonusAt: serverTimestamp(),
        dailyBonusStreak: status.nextStreak,
        updatedAt: serverTimestamp(),
      });

      return {
        claimed: true,
        rewardAmount: actualReward,
        newBalance,
        streak: status.nextStreak,
        lastDailyBonusAtMs: nowMs,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncPlayerVault(
  uid: string,
  patch: PlayerVaultPatch,
): Promise<void> {
  const path = `players/${uid}`;
  const ref = doc(db, 'players', uid);

  const sanitized = {
    balance: clampMoney(patch.balance),
    freeSpinsLeft: clampInt(patch.freeSpinsLeft, 1000),
    freeSpinPot: clampMoney(patch.freeSpinPot),
    freeSpinsPlayed: clampInt(patch.freeSpinsPlayed, 1000),
    totalSpins: clampInt(patch.totalSpins, 1000000000),
    totalWon: clampMoney(patch.totalWon),
    biggestWin: clampMoney(patch.biggestWin),
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(ref, sanitized);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updatePlayerDisplayName(
  uid: string,
  displayName: string,
): Promise<string> {
  const path = `players/${uid}`;
  const ref = doc(db, 'players', uid);
  const cleaned = sanitizeDisplayName(displayName);

  try {
    await updateDoc(ref, {
      displayName: cleaned,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }

  return cleaned;
}
