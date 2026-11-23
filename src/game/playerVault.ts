import { User } from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

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
  };

  try {
    await setDoc(ref, {
      ...initialProfile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return { profile: initialProfile, isNewAccount: true };
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
