import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  RotateCcw,
  Search,
  ShieldCheck,
  Smartphone,
  Wallet,
  XCircle,
} from 'lucide-react';
import { soundEngine } from '../game/audio';
import {
  formatPeso,
  subscribeAllWithdrawals,
  updateWithdrawalStatus,
  WithdrawalRecord,
  WithdrawalStatus,
} from '../game/withdrawals';

interface AdminPageProps {
  user: User | null;
  isAdmin: boolean;
  onBack: () => void;
  onOpenWithdraw: () => void;
  onSelfBalanceRefund?: (refundedCoins: number) => void;
}

type StatusFilter = 'all' | WithdrawalStatus;

function getStatusBadge(status: WithdrawalStatus): {
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
        label: 'Pending',
        classes: 'bg-amber-500/15 border-amber-400/40 text-amber-200',
      };
  }
}

export const AdminPage: React.FC<AdminPageProps> = ({
  user,
  isAdmin,
  onBack,
  onOpenWithdraw,
  onSelfBalanceRefund,
}) => {
  const [requests, setRequests] = useState<WithdrawalRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeAllWithdrawals(
      (rows) => {
        setRequests(rows);
        setLoading(false);
      },
      (err) => {
        setErrorMsg(err.message);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [user, isAdmin]);

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

  const metrics = useMemo(() => {
    let pendingCount = 0;
    let pendingPesos = 0;
    let approvedCount = 0;
    let approvedPesos = 0;
    let paidCount = 0;
    let paidPesos = 0;

    for (const r of requests) {
      if (r.status === 'pending') {
        pendingCount += 1;
        pendingPesos += r.pesoAmount;
      } else if (r.status === 'approved') {
        approvedCount += 1;
        approvedPesos += r.pesoAmount;
      } else if (r.status === 'paid') {
        paidCount += 1;
        paidPesos += r.pesoAmount;
      }
    }

    return {
      pendingCount,
      pendingPesos,
      approvedCount,
      approvedPesos,
      paidCount,
      paidPesos,
    };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return requests.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return (
        r.gcashName.toLowerCase().includes(q) ||
        r.gcashNumber.toLowerCase().includes(q) ||
        r.playerName.toLowerCase().includes(q) ||
        (r.playerEmail ?? '').toLowerCase().includes(q)
      );
    });
  }, [requests, filter, searchQuery]);

  const handleAction = async (
    req: WithdrawalRecord,
    nextStatus: 'approved' | 'paid' | 'rejected',
  ) => {
    if (!user || !isAdmin || busyId) return;
    soundEngine.playClick();
    setErrorMsg(null);
    setInfoMsg(null);
    setBusyId(req.id);
    try {
      await updateWithdrawalStatus({
        withdrawalId: req.id,
        nextStatus,
        adminUid: user.uid,
        adminNote: notesById[req.id],
      });
      if (nextStatus === 'rejected' && req.uid === user.uid) {
        onSelfBalanceRefund?.(req.coinsAmount);
      }
      setInfoMsg(
        nextStatus === 'rejected'
          ? `Rejected ${req.gcashName} (P${req.pesoAmount}) and refunded ${req.coinsAmount.toLocaleString('en-US')}¢.`
          : `Marked ${req.gcashName} (P${req.pesoAmount}) as ${nextStatus}.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to update payout request.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleCopyNumber = async (id: string, number: string) => {
    try {
      await navigator.clipboard.writeText(number);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-[#070a10] text-stone-100 overflow-y-auto">
      <div className="min-h-full max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-7 flex flex-col gap-5">
        {/* Top Bar */}
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
              <h1 className="font-display text-lg sm:text-2xl font-bold text-amber-300 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-300" />
                <span>Admin Payout Console</span>
              </h1>
              <p className="text-xs text-stone-400">
                Review, approve, pay out, or reject player GCash withdrawal requests
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              onOpenWithdraw();
            }}
            className="min-h-[44px] px-4 rounded-xl bg-white/6 hover:bg-white/12 border border-white/15 text-xs sm:text-sm font-semibold text-stone-200 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Wallet className="w-4 h-4 text-emerald-300" />
            <span>Withdraw Page</span>
          </button>
        </header>

        {!isAdmin ? (
          <div className="p-6 rounded-2xl bg-[#0c111b] border border-rose-400/35 text-center space-y-3 max-w-lg mx-auto my-8">
            <XCircle className="w-8 h-8 text-rose-400 mx-auto" />
            <h2 className="font-display text-lg font-bold text-stone-100">
              Admin Access Restricted
            </h2>
            <p className="text-xs sm:text-sm text-stone-400">
              Sign in with the verified administrator Google account to manage
              withdrawal requests.
            </p>
            <button
              type="button"
              onClick={onBack}
              className="min-h-[44px] px-5 rounded-xl bg-amber-500 text-stone-950 font-bold text-sm cursor-pointer"
            >
              Return to Game
            </button>
          </div>
        ) : (
          <>
            {/* Summary Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-[#0c111b] border border-amber-400/30">
                <div className="text-[11px] uppercase tracking-wider text-stone-400">
                  Pending Queue
                </div>
                <div className="font-mono-num text-2xl font-bold text-amber-300 mt-1">
                  {metrics.pendingCount}
                </div>
                <div className="font-mono-num text-xs text-stone-300 mt-0.5">
                  {formatPeso(metrics.pendingPesos, false)} total
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0c111b] border border-sky-400/25">
                <div className="text-[11px] uppercase tracking-wider text-stone-400">
                  Approved
                </div>
                <div className="font-mono-num text-2xl font-bold text-sky-300 mt-1">
                  {metrics.approvedCount}
                </div>
                <div className="font-mono-num text-xs text-stone-300 mt-0.5">
                  {formatPeso(metrics.approvedPesos, false)} ready
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0c111b] border border-emerald-400/25">
                <div className="text-[11px] uppercase tracking-wider text-stone-400">
                  Paid Out
                </div>
                <div className="font-mono-num text-2xl font-bold text-emerald-300 mt-1">
                  {metrics.paidCount}
                </div>
                <div className="font-mono-num text-xs text-stone-300 mt-0.5">
                  {formatPeso(metrics.paidPesos, false)} sent
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#0c111b] border border-white/10">
                <div className="text-[11px] uppercase tracking-wider text-stone-400">
                  Total Requests
                </div>
                <div className="font-mono-num text-2xl font-bold text-stone-100 mt-1">
                  {requests.length}
                </div>
                <div className="text-xs text-stone-400 mt-0.5 truncate">
                  {user?.email}
                </div>
              </div>
            </div>

            {/* Filters & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {(
                  ['all', 'pending', 'approved', 'paid', 'rejected'] as StatusFilter[]
                ).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      soundEngine.playClick();
                      setFilter(tab);
                    }}
                    className={`min-h-[40px] px-3.5 rounded-xl border text-xs font-semibold capitalize transition-colors cursor-pointer ${
                      filter === tab
                        ? 'bg-amber-500 border-amber-400 text-stone-950'
                        : 'bg-[#0c111b] border-white/12 text-stone-300 hover:text-white'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search GCash name or number..."
                  className="w-full min-h-[42px] pl-9 pr-3 rounded-xl bg-[#0c111b] border border-white/15 focus:border-amber-400/70 focus:outline-none text-xs sm:text-sm text-stone-100 placeholder:text-stone-500"
                />
              </div>
            </div>

            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-400/40 text-xs sm:text-sm text-rose-200">
                {errorMsg}
              </div>
            )}

            {infoMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-xs sm:text-sm text-emerald-200">
                {infoMsg}
              </div>
            )}

            {/* Requests Queue */}
            <div className="space-y-3">
              {loading ? (
                <div className="p-8 rounded-2xl bg-[#0c111b] border border-white/10 text-center text-sm text-stone-400">
                  Loading payout requests...
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#0c111b] border border-white/10 text-center text-sm text-stone-400">
                  No withdrawal requests match this view.
                </div>
              ) : (
                filteredRequests.map((req) => {
                  const badge = getStatusBadge(req.status);
                  const isActionable =
                    req.status === 'pending' || req.status === 'approved';
                  const isBusy = busyId === req.id;

                  return (
                    <div
                      key={req.id}
                      className="p-4 sm:p-5 rounded-2xl bg-[#0c111b] border border-white/12 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-mono-num text-xl font-extrabold text-amber-300">
                            P{req.pesoAmount}
                          </span>
                          <span className="font-mono-num text-xs text-stone-400">
                            ({req.coinsAmount.toLocaleString('en-US')}¢)
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${badge.classes}`}
                          >
                            {badge.label}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          <span className="font-semibold text-stone-100">
                            {req.gcashName}
                          </span>
                          <span className="inline-flex items-center gap-1.5 font-mono-num text-emerald-300 font-semibold">
                            <Smartphone className="w-3.5 h-3.5" />
                            <span>{req.gcashNumber}</span>
                            <button
                              type="button"
                              onClick={() =>
                                void handleCopyNumber(req.id, req.gcashNumber)
                              }
                              aria-label="Copy GCash number"
                              className="p-1 rounded bg-white/8 hover:bg-white/15 text-stone-200 cursor-pointer"
                            >
                              {copiedId === req.id ? (
                                <Check className="w-3 h-3 text-emerald-300" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </span>
                        </div>

                        <div className="text-xs text-stone-400 flex flex-wrap gap-x-3 gap-y-1">
                          <span>Player: {req.playerName}</span>
                          {req.playerEmail && <span>{req.playerEmail}</span>}
                          <span className="font-mono-num">
                            {new Date(req.createdAtMs).toLocaleString()}
                          </span>
                        </div>

                        {req.adminNote && !isActionable && (
                          <div className="text-xs text-stone-300 pt-1">
                            Note: {req.adminNote}
                          </div>
                        )}
                      </div>

                      {isActionable && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 lg:min-w-[430px]">
                          <input
                            type="text"
                            maxLength={200}
                            value={notesById[req.id] ?? ''}
                            onChange={(e) =>
                              setNotesById((prev) => ({
                                ...prev,
                                [req.id]: e.target.value,
                              }))
                            }
                            placeholder="Ref # or note (optional)"
                            className="flex-1 min-h-[42px] px-3 rounded-xl bg-[#070a10] border border-white/15 focus:border-amber-400/70 focus:outline-none text-xs text-stone-100 placeholder:text-stone-500"
                          />

                          <div className="flex items-center gap-2 shrink-0">
                            {req.status === 'pending' && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleAction(req, 'approved')}
                                className="min-h-[42px] px-3 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/45 text-xs font-semibold text-sky-200 cursor-pointer disabled:opacity-50"
                              >
                                Approve
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleAction(req, 'paid')}
                              className="min-h-[42px] px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Mark Paid</span>
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleAction(req, 'rejected')}
                              title="Reject and refund coins to player"
                              className="min-h-[42px] px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/45 text-xs font-semibold text-rose-200 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
