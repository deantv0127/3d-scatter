import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Coins,
  LogIn,
  ShieldCheck,
  Smartphone,
  User as UserIcon,
  Wallet,
  XCircle,
} from 'lucide-react';
import { soundEngine } from '../game/audio';
import { PlayerVaultProfile } from '../game/playerVault';
import {
  coinsToPesos,
  formatPeso,
  isValidGcashNumber,
  PAYOUT_TIERS,
  PayoutTier,
  submitWithdrawalRequest,
  subscribePlayerWithdrawals,
  WithdrawalRecord,
} from '../game/withdrawals';

interface WithdrawalPageProps {
  user: User | null;
  profile: PlayerVaultProfile | null;
  balance: number;
  isAdmin: boolean;
  onBalanceDeducted: (newBalance: number) => void;
  onBack: () => void;
  onOpenAuth: () => void;
  onOpenAdmin: () => void;
}

function getStatusStyles(status: WithdrawalRecord['status']): {
  label: string;
  classes: string;
} {
  switch (status) {
    case 'approved':
      return {
        label: 'Approved',
        classes: 'bg-sky-500/15 border-sky-400/40 text-sky-200',
      };
    case 'paid':
      return {
        label: 'Paid',
        classes: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200',
      };
    case 'rejected':
      return {
        label: 'Rejected · Refunded',
        classes: 'bg-rose-500/15 border-rose-400/40 text-rose-200',
      };
    default:
      return {
        label: 'Pending Review',
        classes: 'bg-amber-500/15 border-amber-400/40 text-amber-200',
      };
  }
}

export const WithdrawalPage: React.FC<WithdrawalPageProps> = ({
  user,
  profile,
  balance,
  isAdmin,
  onBalanceDeducted,
  onBack,
  onOpenAuth,
  onOpenAdmin,
}) => {
  const [gcashName, setGcashName] = useState<string>(
    profile?.displayName || user?.displayName || '',
  );
  const [gcashNumber, setGcashNumber] = useState<string>('');
  const [selectedCoins, setSelectedCoins] = useState<number | null>(() => {
    const firstAvailable = PAYOUT_TIERS.find((t) => balance >= t.coins);
    return firstAvailable ? firstAvailable.coins : null;
  });
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<WithdrawalRecord[]>([]);

  const equivalentPesos = useMemo(() => coinsToPesos(balance), [balance]);

  useEffect(() => {
    if (!gcashName && (profile?.displayName || user?.displayName)) {
      setGcashName(profile?.displayName || user?.displayName || '');
    }
  }, [gcashName, profile?.displayName, user?.displayName]);

  useEffect(() => {
    if (selectedCoins !== null && balance < selectedCoins) {
      const fallback = PAYOUT_TIERS.find((t) => balance >= t.coins);
      setSelectedCoins(fallback ? fallback.coins : null);
    } else if (selectedCoins === null) {
      const firstAvailable = PAYOUT_TIERS.find((t) => balance >= t.coins);
      if (firstAvailable) {
        setSelectedCoins(firstAvailable.coins);
      }
    }
  }, [balance, selectedCoins]);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    const unsub = subscribePlayerWithdrawals(
      user.uid,
      (rows) => setHistory(rows),
      (err) => setErrorMsg(err.message),
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onBack();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onBack]);

  const selectedTier: PayoutTier | null =
    PAYOUT_TIERS.find((t) => t.coins === selectedCoins) ?? null;

  const canSubmit =
    Boolean(user) &&
    !submitting &&
    selectedTier !== null &&
    balance >= selectedTier.coins &&
    gcashName.trim().length >= 2 &&
    isValidGcashNumber(gcashNumber);

  const handleSubmitPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!user) {
      onOpenAuth();
      return;
    }
    if (!selectedTier || balance < selectedTier.coins) {
      setErrorMsg('Select an available payout amount within your balance.');
      return;
    }
    if (gcashName.trim().length < 2) {
      setErrorMsg('Please enter the GCash account name of the claimant.');
      return;
    }
    if (!isValidGcashNumber(gcashNumber)) {
      setErrorMsg(
        'Enter a valid GCash mobile number (e.g. 09171234567 or +639171234567).',
      );
      return;
    }

    soundEngine.playClick();
    setSubmitting(true);
    try {
      const playerName =
        profile?.displayName ||
        user.displayName ||
        user.email?.split('@')[0] ||
        'Player';
      const result = await submitWithdrawalRequest({
        user,
        playerName,
        gcashName,
        gcashNumber,
        tier: selectedTier,
      });
      onBalanceDeducted(result.newBalance);
      setSuccessMsg(
        `Payout request submitted for ${selectedTier.label} (${selectedTier.coins.toLocaleString('en-US')}¢) to ${gcashName.trim()}. Sent to Admin queue.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unable to submit payout request right now.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-[#070a10] text-stone-100 overflow-y-auto">
      <div className="min-h-full max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-7 flex flex-col gap-5">
        {/* Top Navigation Row */}
        <header className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                onBack();
              }}
              className="min-h-[44px] px-3.5 rounded-xl bg-white/6 hover:bg-white/12 border border-white/15 text-xs sm:text-sm font-semibold text-stone-200 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-amber-300" />
              <span>Back to Table</span>
            </button>
            <div>
              <h1 className="font-display text-lg sm:text-2xl font-bold text-amber-300 leading-tight">
                GCash Withdrawal
              </h1>
              <p className="text-xs text-stone-400">
                Convert your credits into Philippine Peso payouts
              </p>
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                onOpenAdmin();
              }}
              className="min-h-[44px] px-4 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/45 text-xs sm:text-sm font-semibold text-amber-200 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-amber-300" />
              <span>Admin Payouts</span>
            </button>
          )}
        </header>

        {/* Top-Left Total & Equivalent Peso Summary + Rate Reference */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          <div className="lg:col-span-6 p-5 rounded-2xl bg-gradient-to-br from-[#131b2b] to-[#0b101b] border border-amber-400/35 shadow-xl flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-stone-400 font-semibold">
                  Total Balance
                </div>
                <div className="font-mono-num text-3xl sm:text-4xl font-extrabold text-white mt-1 leading-none">
                  {balance.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  ¢
                </div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-amber-300" />
              </div>
            </div>

            <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-stone-400">
                  Equivalent Peso Value
                </div>
                <div className="font-mono-num text-2xl font-bold text-emerald-300 mt-0.5">
                  {formatPeso(equivalentPesos)}
                </div>
              </div>
              <div className="text-xs font-mono-num text-amber-200/80 bg-amber-500/10 border border-amber-400/25 rounded-lg px-2.5 py-1.5">
                2,000¢ = P5 · 400¢ = P1
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 p-5 rounded-2xl bg-[#0c111b] border border-white/10 flex flex-col justify-between">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-amber-300 font-semibold">
              <Coins className="w-4 h-4" />
              <span>Conversion Table</span>
            </div>
            <div className="grid grid-cols-5 gap-2 mt-3">
              {PAYOUT_TIERS.map((tier) => {
                const affordable = balance >= tier.coins;
                return (
                  <div
                    key={tier.coins}
                    className={`p-2 rounded-xl border text-center ${
                      affordable
                        ? 'bg-emerald-500/10 border-emerald-400/35 text-emerald-200'
                        : 'bg-white/4 border-white/10 text-stone-400'
                    }`}
                  >
                    <div className="font-mono-num text-xs sm:text-sm font-bold">
                      {tier.label}
                    </div>
                    <div className="font-mono-num text-[10px] sm:text-[11px] opacity-85 mt-0.5">
                      {tier.coins.toLocaleString('en-US')}¢
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-stone-400 mt-3 leading-relaxed">
              Payouts are delivered via GCash to the claimant name and mobile
              number below after admin verification.
            </p>
          </div>
        </div>

        {/* Payout Request Form */}
        <form
          onSubmit={(e) => void handleSubmitPayout(e)}
          className="p-5 sm:p-6 rounded-2xl bg-[#0c111b] border border-amber-400/25 shadow-xl space-y-5"
        >
          {!user && (
            <div className="p-4 rounded-xl bg-amber-500/12 border border-amber-400/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs sm:text-sm text-amber-100">
                Sign in to your Player Vault account to submit a GCash payout
                request.
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  onOpenAuth();
                }}
                className="min-h-[42px] px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shrink-0 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Log In / Sign Up</span>
              </button>
            </div>
          )}

          {/* Input Bars: GCash Account Name & Claimant Mobile Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="gcash-account-name"
                className="block text-xs uppercase tracking-wider text-stone-300 font-semibold mb-1.5"
              >
                GCash Account Name (Claimant)
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-amber-300/80 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="gcash-account-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={gcashName}
                  onChange={(e) => setGcashName(e.target.value)}
                  placeholder="Full name on GCash account"
                  className="w-full min-h-[48px] pl-10 pr-3.5 rounded-xl bg-[#070a10] border border-white/15 focus:border-amber-400/75 focus:outline-none text-sm text-stone-100 placeholder:text-stone-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="gcash-mobile-number"
                className="block text-xs uppercase tracking-wider text-stone-300 font-semibold mb-1.5"
              >
                GCash Mobile Number
              </label>
              <div className="relative">
                <Smartphone className="w-4 h-4 text-amber-300/80 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="gcash-mobile-number"
                  type="tel"
                  required
                  value={gcashNumber}
                  onChange={(e) => setGcashNumber(e.target.value)}
                  placeholder="0917 123 4567"
                  className="w-full min-h-[48px] pl-10 pr-3.5 rounded-xl bg-[#070a10] border border-white/15 focus:border-amber-400/75 focus:outline-none font-mono-num text-sm text-stone-100 placeholder:text-stone-500"
                />
              </div>
            </div>
          </div>

          {/* Available Amount Selection Highlighted by Balance */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <span className="text-xs uppercase tracking-wider text-stone-300 font-semibold">
                Select Payout Amount
              </span>
              <span className="text-xs text-stone-400">
                Available tiers for your{' '}
                <span className="font-mono-num text-amber-300 font-semibold">
                  {balance.toLocaleString('en-US', {
                    maximumFractionDigits: 2,
                  })}
                  ¢
                </span>{' '}
                balance are highlighted
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {PAYOUT_TIERS.map((tier) => {
                const isAvailable = balance >= tier.coins;
                const isSelected = selectedCoins === tier.coins && isAvailable;
                const shortfall = Math.max(
                  0,
                  Math.ceil(tier.coins - balance),
                );

                return (
                  <button
                    key={tier.coins}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => {
                      soundEngine.playClick();
                      setSelectedCoins(tier.coins);
                      setErrorMsg(null);
                    }}
                    className={`relative p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[92px] ${
                      isSelected
                        ? 'bg-gradient-to-b from-amber-400/25 to-amber-500/12 border-amber-300 ring-2 ring-amber-400/60 shadow-[0_0_24px_rgba(245,158,11,0.28)] cursor-pointer'
                        : isAvailable
                          ? 'bg-emerald-500/12 hover:bg-emerald-500/18 border-emerald-400/55 shadow-[0_0_16px_rgba(16,185,129,0.14)] cursor-pointer'
                          : 'bg-[#080c14] border-white/8 opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`font-mono-num text-lg sm:text-xl font-extrabold ${
                          isSelected
                            ? 'text-amber-200'
                            : isAvailable
                              ? 'text-emerald-300'
                              : 'text-stone-400'
                        }`}
                      >
                        {tier.label}
                      </span>
                      {isSelected ? (
                        <CheckCircle2 className="w-4 h-4 text-amber-300 shrink-0" />
                      ) : isAvailable ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-200">
                          Ready
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2">
                      <div className="font-mono-num text-xs font-semibold text-stone-200">
                        {tier.coins.toLocaleString('en-US')}¢
                      </div>
                      <div className="text-[10px] text-stone-400 mt-0.5">
                        {isAvailable
                          ? 'Available to claim'
                          : `Need ${shortfall.toLocaleString('en-US')}¢`}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-400/40 text-xs sm:text-sm text-rose-200 flex items-start gap-2">
              <XCircle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-xs sm:text-sm text-emerald-200 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Request Payout CTA */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/10">
            <div className="text-xs text-stone-400">
              {selectedTier ? (
                <span>
                  Selected:{' '}
                  <strong className="text-amber-300 font-mono-num">
                    {selectedTier.coins.toLocaleString('en-US')}¢ →{' '}
                    {selectedTier.label}
                  </strong>
                </span>
              ) : (
                <span>
                  Minimum payout is{' '}
                  <strong className="text-stone-200 font-mono-num">
                    2,000¢ (P5)
                  </strong>
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="min-h-[48px] px-7 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-amber-500/25 disabled:text-stone-400 active:scale-[0.98] text-stone-950 font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              <Wallet className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Submitting Payout...'
                  : selectedTier
                    ? `Request Payout (${selectedTier.label})`
                    : 'Request Payout'}
              </span>
            </button>
          </div>
        </form>

        {/* Player Payout History */}
        <section className="p-5 rounded-2xl bg-[#0c111b] border border-white/10 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold text-stone-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-300" />
              <span>Your Payout Requests</span>
            </h2>
            <span className="text-xs text-stone-400 font-mono-num">
              {history.length} total
            </span>
          </div>

          {!user ? (
            <p className="text-xs text-stone-400 py-3">
              Sign in to view your submitted GCash payout history.
            </p>
          ) : history.length === 0 ? (
            <p className="text-xs text-stone-400 py-3">
              No withdrawal requests yet. Once you submit a request, its status
              appears here.
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((item) => {
                const badge = getStatusStyles(item.status);
                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-[#080c14] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono-num text-sm font-bold text-amber-300">
                          P{item.pesoAmount}
                        </span>
                        <span className="font-mono-num text-xs text-stone-400">
                          ({item.coinsAmount.toLocaleString('en-US')}¢)
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${badge.classes}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <div className="text-xs text-stone-300 truncate">
                        GCash: {item.gcashName} ·{' '}
                        <span className="font-mono-num">{item.gcashNumber}</span>
                      </div>
                      {item.adminNote && (
                        <div className="text-[11px] text-stone-400">
                          Note: {item.adminNote}
                        </div>
                      )}
                    </div>
                    <div className="text-[11px] text-stone-500 font-mono-num shrink-0">
                      {new Date(item.createdAtMs).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
