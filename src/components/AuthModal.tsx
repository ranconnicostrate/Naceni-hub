import React, { useState } from 'react';
import { Building2, Lock, Mail, Phone, User, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../services/api.ts';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: 'login' | 'register' | 'forgot';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  onClose,
  initialTab = 'login',
}) => {
  const { signInWithGoogle, loginWithPassword, registerAccount } = useAuth();
  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>(initialTab);
  const [accountType, setAccountType] = useState<'REGULAR' | 'B2B'>('REGULAR');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [tinNumber, setTinNumber] = useState('');
  const [industry, setIndustry] = useState('Commercial Construction');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (!open) return null;

  const handleGoogle = async () => {
    setError('');
    setBusy(true);
    try {
      await signInWithGoogle();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Google Sign-In failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await loginWithPassword(email, password);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await registerAccount({
        email,
        password,
        fullName,
        phone,
        accountType,
        ...(accountType === 'B2B'
          ? { companyName, tinNumber, industry }
          : {}),
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await apiFetch<{ message: string }>(
        '/api/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({ email }),
        }
      );
      setNotice(res.message);
    } catch (err: any) {
      setError(err?.message || 'Could not process reset request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1F3A]/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close authentication modal"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="font-display text-xl font-bold text-[#0B1F3A]">
          {tab === 'login'
            ? "Sign in to Naceni's Business"
            : tab === 'register'
              ? 'Create Customer or B2B Account'
              : 'Reset Account Password'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {tab === 'login'
            ? 'Access wholesale pricing, order tracking, and operational tools.'
            : tab === 'register'
              ? 'Register for retail supply or verified B2B contractor procurement.'
              : 'Enter your registered email to receive reset instructions.'}
        </p>

        <div className="mt-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setError('');
              setNotice('');
            }}
            className={`flex-1 rounded-md py-2 transition-colors ${
              tab === 'login'
                ? 'bg-white text-[#0B1F3A] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setError('');
              setNotice('');
            }}
            className={`flex-1 rounded-md py-2 transition-colors ${
              tab === 'register'
                ? 'bg-white text-[#0B1F3A] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Register
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('forgot');
              setError('');
              setNotice('');
            }}
            className={`flex-1 rounded-md py-2 transition-colors ${
              tab === 'forgot'
                ? 'bg-white text-[#0B1F3A] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Reset
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
            {notice}
          </div>
        )}

        {tab !== 'forgot' && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={handleGoogle}
              className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              Continue with Google
            </button>

            <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
              <div className="h-px flex-1 bg-slate-200" />
              <span>or with email</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
          </>
        )}

        {tab === 'login' && (
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.rw"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-[#0B1F3A] focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-[#0B1F3A] focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[#0B1F3A] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#13325C] disabled:opacity-60"
            >
              {busy ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        )}

        {tab === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAccountType('REGULAR')}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  accountType === 'REGULAR'
                    ? 'border-[#F97316] bg-orange-50 text-[#C2410C]'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Individual Customer
              </button>
              <button
                type="button"
                onClick={() => setAccountType('B2B')}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  accountType === 'B2B'
                    ? 'border-[#F97316] bg-orange-50 text-[#C2410C]'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                B2B Contractor
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Mugabo"
                    className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-2.5 text-xs focus:border-[#0B1F3A] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Phone
                </label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+250 788 ..."
                    className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-2.5 text-xs focus:border-[#0B1F3A] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {accountType === 'B2B' && (
              <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Company Name
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Horizon Builders Ltd"
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-2.5 text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Tax TIN
                    </label>
                    <input
                      type="text"
                      required
                      value={tinNumber}
                      onChange={(e) => setTinNumber(e.target.value)}
                      placeholder="104928371"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Sector
                    </label>
                    <input
                      type="text"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@domain.rw"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-[#0B1F3A] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Password (min 8 chars)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create strong password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-[#0B1F3A] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[#F97316] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C] disabled:opacity-60"
            >
              {busy ? 'Creating Account...' : 'Create Account'}
            </button>
          </form>
        )}

        {tab === 'forgot' && (
          <form onSubmit={handleForgot} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Registered Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.rw"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[#0B1F3A] py-2.5 text-sm font-semibold text-white hover:bg-[#13325C]"
            >
              {busy ? 'Sending...' : 'Request Password Reset'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
