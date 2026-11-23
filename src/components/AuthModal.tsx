import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  LogIn,
  LogOut,
  Mail,
  UserPlus,
  X,
} from 'lucide-react';
import { auth, firebaseProjectId, googleProvider } from '../firebase';
import { PlayerVaultProfile } from '../game/playerVault';
import { soundEngine } from '../game/audio';

interface AuthModalProps {
  user: User | null;
  profile: PlayerVaultProfile | null;
  initialMode?: 'login' | 'signup';
  onPrepareSignupName?: (name: string) => void;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  user,
  profile,
  initialMode = 'login',
  onPrepareSignupName,
  onClose,
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [displayName, setDisplayName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [busy, setBusy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [unauthorizedHost, setUnauthorizedHost] = useState<string | null>(null);
  const [providerNotEnabled, setProviderNotEnabled] = useState<boolean>(false);
  const [copiedHost, setCopiedHost] = useState<boolean>(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const clearFeedback = () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setUnauthorizedHost(null);
    setProviderNotEnabled(false);
  };

  const handleAuthError = (err: unknown) => {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';

    if (
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request'
    ) {
      setErrorMsg('Sign-in popup was closed before completing.');
    } else if (code === 'auth/popup-blocked') {
      setErrorMsg(
        'Popup was blocked by your browser. Please allow popups and try again.',
      );
    } else if (code === 'auth/unauthorized-domain') {
      const host =
        typeof window !== 'undefined' ? window.location.hostname : '';
      setUnauthorizedHost(host || 'current domain');
      setErrorMsg(
        'This domain is not yet authorized for Google Sign-In on your Firebase project.',
      );
    } else if (code === 'auth/operation-not-allowed') {
      setProviderNotEnabled(true);
      setErrorMsg(
        'Email/Password sign-in is not enabled yet in Firebase Console.',
      );
    } else if (code === 'auth/email-already-in-use') {
      setErrorMsg(
        'An account with this email already exists. Switch to Log In instead.',
      );
    } else if (
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found'
    ) {
      setErrorMsg('Invalid email or password. Please check and try again.');
    } else if (code === 'auth/invalid-email') {
      setErrorMsg('Please enter a valid email address.');
    } else if (code === 'auth/weak-password') {
      setErrorMsg('Password must be at least 6 characters long.');
    } else if (code === 'auth/too-many-requests') {
      setErrorMsg('Too many attempts. Please wait a moment and try again.');
    } else {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unable to authenticate right now. Please try again.',
      );
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    soundEngine.playClick();
    clearFeedback();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMsg('Please enter your email address.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        const trimmedName = displayName.trim().slice(0, 64);
        if (trimmedName) {
          onPrepareSignupName?.(trimmedName);
        }
        const cred = await createUserWithEmailAndPassword(
          auth,
          trimmedEmail,
          password,
        );
        if (trimmedName) {
          await updateProfile(cred.user, { displayName: trimmedName });
        }
        onClose();
      } else {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
        onClose();
      }
    } catch (err) {
      onPrepareSignupName?.('');
      handleAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordReset = async () => {
    if (busy) return;
    soundEngine.playClick();
    clearFeedback();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMsg('Enter your email address above first to reset your password.');
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setInfoMsg(
        `Password reset email sent to ${trimmedEmail}. Check your inbox.`,
      );
    } catch (err) {
      handleAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (busy) return;
    soundEngine.playClick();
    clearFeedback();
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err) {
      handleAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const handleCopyHost = async () => {
    if (!unauthorizedHost) return;
    try {
      await navigator.clipboard.writeText(unauthorizedHost);
      setCopiedHost(true);
      window.setTimeout(() => setCopiedHost(false), 1800);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  const handleSignOut = async () => {
    if (busy) return;
    soundEngine.playClick();
    clearFeedback();
    setBusy(true);
    try {
      await signOut(auth);
      onClose();
    } catch (err) {
      handleAuthError(err);
    } finally {
      setBusy(false);
    }
  };

  const authSettingsUrl = `https://console.firebase.google.com/project/${firebaseProjectId}/authentication/settings`;
  const authProvidersUrl = `https://console.firebase.google.com/project/${firebaseProjectId}/authentication/providers`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/82"
      role="dialog"
      aria-modal="true"
      aria-label={user ? 'Player Vault Account' : 'Login or Sign Up'}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[90dvh] flex flex-col rounded-2xl bg-[#0c111b] border border-amber-400/35 text-stone-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-amber-300">
              {user
                ? 'Player Vault'
                : mode === 'login'
                  ? 'Welcome Back'
                  : 'Create Player Vault'}
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              {user
                ? 'Cloud-synced vault balance and spin history'
                : mode === 'login'
                  ? 'Log in to restore your saved balance and bonus progress'
                  : 'Sign up to claim your 200¢ starter bonus and save progress'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account modal"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-stone-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {user ? (
            <>
              <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-[#121927] border border-amber-400/20">
                {profile?.photoUrl || user.photoURL ? (
                  <img
                    src={profile?.photoUrl || user.photoURL || ''}
                    alt={profile?.displayName || 'Player avatar'}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-xl object-cover border border-amber-400/40 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center font-display text-lg font-bold text-amber-300 shrink-0">
                    {(profile?.displayName || user.displayName || user.email || 'P')
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-stone-100 truncate">
                    {profile?.displayName || user.displayName || 'Player'}
                  </div>
                  <div className="text-xs text-stone-400 truncate mt-0.5">
                    {user.email || 'Authenticated Player'}
                  </div>
                </div>
              </div>

              {profile && (
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className="p-3 rounded-xl bg-[#121927] border border-white/10">
                    <div className="text-[10px] uppercase tracking-wider text-stone-400">
                      Spins
                    </div>
                    <div className="font-mono-num text-sm font-bold text-stone-100 mt-1">
                      {profile.totalSpins.toLocaleString('en-US')}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#121927] border border-white/10">
                    <div className="text-[10px] uppercase tracking-wider text-stone-400">
                      Total Won
                    </div>
                    <div className="font-mono-num text-sm font-bold text-emerald-300 mt-1">
                      {profile.totalWon.toFixed(0)}¢
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#121927] border border-white/10">
                    <div className="text-[10px] uppercase tracking-wider text-stone-400">
                      Best Win
                    </div>
                    <div className="font-mono-num text-sm font-bold text-amber-300 mt-1">
                      {profile.biggestWin.toFixed(2)}¢
                    </div>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-400/40 text-xs text-rose-200">
                  {errorMsg}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={busy}
                className="w-full min-h-[48px] px-5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/15 text-stone-200 font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                <span>{busy ? 'Signing Out...' : 'Sign Out'}</span>
              </button>
            </>
          ) : (
            <>
              {/* Log In / Sign Up Mode Switcher */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#070a10] border border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setMode('login');
                    clearFeedback();
                  }}
                  className={`min-h-[44px] rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    mode === 'login'
                      ? 'bg-amber-500 text-stone-950'
                      : 'text-stone-300 hover:text-white'
                  }`}
                >
                  <LogIn className="w-4 h-4" />
                  <span>Log In</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setMode('signup');
                    clearFeedback();
                  }}
                  className={`min-h-[44px] rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    mode === 'signup'
                      ? 'bg-amber-500 text-stone-950'
                      : 'text-stone-300 hover:text-white'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Sign Up</span>
                </button>
              </div>

              {infoMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-xs text-emerald-200">
                  {infoMsg}
                </div>
              )}

              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-400/40 text-xs text-rose-100 space-y-2.5">
                  <p className="leading-relaxed">{errorMsg}</p>

                  {providerNotEnabled && (
                    <div className="space-y-2 pt-1 border-t border-rose-400/25">
                      <p className="text-[11px] text-rose-200/90 leading-relaxed">
                        Open Firebase Console → Authentication → Sign-in method
                        and toggle on Email/Password.
                      </p>
                      <a
                        href={authProvidersUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[36px] px-3 rounded-lg bg-white/10 hover:bg-white/18 text-[11px] font-semibold text-amber-200 inline-flex items-center gap-1.5"
                      >
                        <span>Enable Email/Password</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}

                  {unauthorizedHost && (
                    <div className="space-y-2 pt-1 border-t border-rose-400/25">
                      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#070a10]/90 border border-white/10">
                        <span className="font-mono-num text-[11px] text-amber-200 truncate">
                          {unauthorizedHost}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopyHost()}
                          className="min-h-[32px] px-2 rounded-md bg-white/10 hover:bg-white/20 text-[11px] text-stone-100 flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          {copiedHost ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-300" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-rose-200/90 leading-relaxed">
                        Add this domain under Firebase Console → Authentication →
                        Settings → Authorized domains, or reload if it was just
                        registered.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={authSettingsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[36px] px-3 rounded-lg bg-white/10 hover:bg-white/18 text-[11px] font-semibold text-amber-200 inline-flex items-center gap-1.5"
                        >
                          <span>Auth Settings</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => window.location.reload()}
                          className="min-h-[36px] px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-[11px] font-semibold text-amber-200 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>Reload & Retry</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Email & Password Form */}
              <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-3">
                {mode === 'signup' && (
                  <div>
                    <label
                      htmlFor="auth-display-name"
                      className="block text-[11px] uppercase tracking-wider text-stone-400 mb-1"
                    >
                      Player Name
                    </label>
                    <input
                      id="auth-display-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={64}
                      autoComplete="nickname"
                      placeholder="e.g. RoyalAce"
                      className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#070a10] border border-white/15 focus:border-amber-400/70 focus:outline-none text-sm text-stone-100 placeholder:text-stone-500"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="auth-email"
                    className="block text-[11px] uppercase tracking-wider text-stone-400 mb-1"
                  >
                    Email Address
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#070a10] border border-white/15 focus:border-amber-400/70 focus:outline-none text-sm text-stone-100 placeholder:text-stone-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="auth-password"
                      className="block text-[11px] uppercase tracking-wider text-stone-400"
                    >
                      Password
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => void handlePasswordReset()}
                        disabled={busy}
                        className="text-[11px] text-amber-300/90 hover:text-amber-200 cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={
                        mode === 'signup' ? 'new-password' : 'current-password'
                      }
                      placeholder="Min. 6 characters"
                      className="w-full min-h-[44px] pl-3.5 pr-11 rounded-xl bg-[#070a10] border border-white/15 focus:border-amber-400/70 focus:outline-none text-sm text-stone-100 placeholder:text-stone-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[38px] min-h-[38px] flex items-center justify-center text-stone-400 hover:text-stone-200 cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[48px] px-5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50 text-stone-950 font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                >
                  <Mail className="w-4 h-4 shrink-0" />
                  <span>
                    {busy
                      ? mode === 'login'
                        ? 'Logging In...'
                        : 'Creating Account...'
                      : mode === 'login'
                        ? 'Log In with Email'
                        : 'Create Account'}
                  </span>
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-stone-500">
                <div className="h-px flex-1 bg-white/10" />
                <span>or</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              {/* Google Sign-In Fallback / Option */}
              <button
                type="button"
                onClick={() => void handleGoogleAuth()}
                disabled={busy}
                className="w-full min-h-[46px] px-5 rounded-xl bg-white/8 hover:bg-white/14 active:scale-[0.98] disabled:opacity-50 border border-white/15 text-stone-100 font-semibold text-sm flex items-center justify-center gap-2.5 transition-all cursor-pointer"
              >
                <svg
                  className="w-4 h-4 shrink-0"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fill="#fbbf24"
                    d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
