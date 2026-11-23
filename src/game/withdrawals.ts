import { User } from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Unsubscribe,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export const ADMIN_EMAIL = 'deantv0127@gmail.com';
export const COINS_PER_PESO = 400; // 2,000¢ = P5 -> 400¢ = P1

export interface PayoutTier {
  coins: number;
  pesos: number;
  label: string;
}

export const PAYOUT_TIERS: PayoutTier[] = [
  { coins: 2000, pesos: 5, label: 'P5' },
  { coins: 4000, pesos: 10, label: 'P10' },
  { coins: 8000, pesos: 20, label: 'P20' },
  { coins: 20000, pesos: 50, label: 'P50' },
  { coins: 40000, pesos: 100, label: 'P100' },
];

export type WithdrawalStatus = 'pending' | 'approved' | 'paid' | 'rejected';

export interface WithdrawalRecord {
  id: string;
  uid: string;
  playerName: string;
  playerEmail?: string;
  gcashName: string;
  gcashNumber: string;
  coinsAmount: number;
  pesoAmount: number;
  status: WithdrawalStatus;
  adminNote?: string;
  processedBy?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export function coinsToPesos(coins: number): number {
  if (!Number.isFinite(coins) || coins <= 0) return 0;
  return coins / COINS_PER_PESO;
}

export function formatPeso(amount: number, showDecimals = true): string {
  const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return `P${safe.toLocaleString('en-US', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  })}`;
}

export function normalizeGcashNumber(raw: string): string {
  return raw.replace(/[\s\-()]/g, '').trim();
}

export function isValidGcashNumber(raw: string): boolean {
  const normalized = normalizeGcashNumber(raw);
  return /^(09|\+?639)[0-9]{9}$/.test(normalized);
}

export function isUserAdmin(user: User | null): boolean {
  if (!user) return false;
  return (
    user.emailVerified === true &&
    (user.email ?? '').toLowerCase() === ADMIN_EMAIL
  );
}

function extractMillis(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (raw && typeof raw === 'object') {
    const maybeTs = raw as { toMillis?: () => number; seconds?: number };
    if (typeof maybeTs.toMillis === 'function') {
      const ms = maybeTs.toMillis();
      if (Number.isFinite(ms)) return ms;
    }
    if (typeof maybeTs.seconds === 'number' && Number.isFinite(maybeTs.seconds)) {
      return maybeTs.seconds * 1000;
    }
  }
  return Date.now();
}

function mapDocToWithdrawal(
  docId: string,
  data: Record<string, unknown>,
): WithdrawalRecord {
  const rawStatus = String(data.status ?? 'pending');
  const status: WithdrawalStatus =
    rawStatus === 'approved' ||
    rawStatus === 'paid' ||
    rawStatus === 'rejected'
      ? rawStatus
      : 'pending';

  return {
    id: typeof data.id === 'string' && data.id ? data.id : docId,
    uid: String(data.uid ?? ''),
    playerName: String(data.playerName ?? 'Player'),
    playerEmail:
      typeof data.playerEmail === 'string' && data.playerEmail
        ? data.playerEmail
        : undefined,
    gcashName: String(data.gcashName ?? ''),
    gcashNumber: String(data.gcashNumber ?? ''),
    coinsAmount: Number(data.coinsAmount ?? 0),
    pesoAmount: Number(data.pesoAmount ?? 0),
    status,
    adminNote:
      typeof data.adminNote === 'string' && data.adminNote
        ? data.adminNote
        : undefined,
    processedBy:
      typeof data.processedBy === 'string' && data.processedBy
        ? data.processedBy
        : undefined,
    createdAtMs: extractMillis(data.createdAt),
    updatedAtMs: extractMillis(data.updatedAt),
  };
}

export async function submitWithdrawalRequest(params: {
  user: User;
  playerName: string;
  gcashName: string;
  gcashNumber: string;
  tier: PayoutTier;
}): Promise<{ id: string; newBalance: number }> {
  const { user, playerName, gcashName, gcashNumber, tier } = params;

  const cleanPlayerName = (playerName.trim() || 'Player').slice(0, 64);
  const cleanGcashName = gcashName.trim().slice(0, 80);
  const cleanGcashNumber = normalizeGcashNumber(gcashNumber);
  const cleanEmail = (user.email ?? '').trim().slice(0, 128);

  if (cleanGcashName.length < 2) {
    throw new Error('Please enter the full GCash account name.');
  }
  if (!isValidGcashNumber(cleanGcashNumber)) {
    throw new Error(
      'Please enter a valid PH GCash mobile number (e.g., 09171234567).',
    );
  }
  const matchedTier = PAYOUT_TIERS.find(
    (t) => t.coins === tier.coins && t.pesos === tier.pesos,
  );
  if (!matchedTier) {
    throw new Error('Invalid payout tier selected.');
  }

  const withdrawalId = `wd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const playerRef = doc(db, 'players', user.uid);
  const withdrawalRef = doc(db, 'withdrawals', withdrawalId);

  try {
    return await runTransaction(db, async (tx) => {
      const playerSnap = await tx.get(playerRef);
      if (!playerSnap.exists()) {
        throw new Error('Player vault not found. Please reload and try again.');
      }

      const currentBalance = Number(playerSnap.data().balance ?? 0);
      if (currentBalance < matchedTier.coins) {
        throw new Error(
          `Insufficient balance. You need ${matchedTier.coins.toLocaleString('en-US')}¢ for ${matchedTier.label}.`,
        );
      }

      const newBalance =
        Math.round((currentBalance - matchedTier.coins) * 100) / 100;

      tx.update(playerRef, {
        balance: newBalance,
        updatedAt: serverTimestamp(),
      });

      tx.set(withdrawalRef, {
        id: withdrawalId,
        uid: user.uid,
        playerName: cleanPlayerName,
        ...(cleanEmail ? { playerEmail: cleanEmail } : {}),
        gcashName: cleanGcashName,
        gcashNumber: cleanGcashNumber,
        coinsAmount: matchedTier.coins,
        pesoAmount: matchedTier.pesos,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return { id: withdrawalId, newBalance };
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Insufficient balance') ||
        error.message.includes('Player vault not found'))
    ) {
      throw error;
    }
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `withdrawals/${withdrawalId}`,
    );
  }
}

export function subscribePlayerWithdrawals(
  uid: string,
  onData: (items: WithdrawalRecord[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = 'withdrawals';
  const q = query(
    collection(db, path),
    where('uid', '==', uid),
    limit(50),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs
        .map((d) => mapDocToWithdrawal(d.id, d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export function subscribeAllWithdrawals(
  onData: (items: WithdrawalRecord[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const path = 'withdrawals';
  const q = query(
    collection(db, path),
    orderBy('createdAt', 'desc'),
    limit(150),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const rows = snapshot.docs.map((d) =>
        mapDocToWithdrawal(d.id, d.data() as Record<string, unknown>),
      );
      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export async function updateWithdrawalStatus(params: {
  withdrawalId: string;
  nextStatus: 'approved' | 'paid' | 'rejected';
  adminUid: string;
  adminNote?: string;
}): Promise<void> {
  const { withdrawalId, nextStatus, adminUid, adminNote } = params;
  const withdrawalRef = doc(db, 'withdrawals', withdrawalId);
  const cleanNote = (adminNote ?? '').trim().slice(0, 200);

  try {
    await runTransaction(db, async (tx) => {
      const wdSnap = await tx.get(withdrawalRef);
      if (!wdSnap.exists()) {
        throw new Error('Withdrawal request not found.');
      }

      const wdData = wdSnap.data();
      const currentStatus = String(wdData.status ?? '');
      if (currentStatus !== 'pending' && currentStatus !== 'approved') {
        throw new Error('This withdrawal request is already finalized.');
      }

      if (nextStatus === 'rejected') {
        const targetUid = String(wdData.uid ?? '');
        const refundCoins = Number(wdData.coinsAmount ?? 0);
        if (targetUid && refundCoins > 0) {
          const playerRef = doc(db, 'players', targetUid);
          const playerSnap = await tx.get(playerRef);
          if (playerSnap.exists()) {
            const currBal = Number(playerSnap.data().balance ?? 0);
            const refunded = Math.round((currBal + refundCoins) * 100) / 100;
            tx.update(playerRef, {
              balance: refunded,
              updatedAt: serverTimestamp(),
            });
          }
        }
      }

      tx.update(withdrawalRef, {
        status: nextStatus,
        processedBy: adminUid,
        ...(cleanNote ? { adminNote: cleanNote } : {}),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('already finalized') ||
        error.message.includes('not found'))
    ) {
      throw error;
    }
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `withdrawals/${withdrawalId}`,
    );
  }
}
