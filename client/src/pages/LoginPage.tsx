import React, { useState, ChangeEvent, FormEvent } from 'react';
import { AxiosError } from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await authAPI.login({ email, password });
      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('authTokenExpiresAt', response.data.expires_at);

      const pendingInviteCode = sessionStorage.getItem('pendingInviteCode');
      if (pendingInviteCode) {
        sessionStorage.removeItem('pendingInviteCode');
        navigate(`/invite/${pendingInviteCode}`);
      } else {
        navigate('/chat');
      }
    } catch (err) {
      console.error('Login error:', err);
      const axiosError = err as AxiosError<{ error?: string }>;
      const serverMessage = axiosError?.response?.data?.error;
      setError(serverMessage || 'Login failed. Please check your credentials, verify your email, and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value);
  };

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-950 via-slate-950 to-slate-950 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-900/20 via-transparent to-transparent" aria-hidden="true" />
      
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col lg:flex-row">
        <aside className="flex flex-col justify-between px-8 py-12 lg:w-1/2 lg:py-20 lg:px-16">
          <div className="space-y-12">
            <div>
              <h1 className="text-5xl font-bold tracking-tight text-white lg:text-6xl">
                bobbins<span className="text-violet-400">.app</span>
              </h1>
              <p className="mt-6 text-lg text-slate-300 leading-relaxed lg:text-xl">
                Your completely <span className="font-semibold text-violet-300">free</span> and completely <span className="font-semibold text-violet-300">private</span> space for everything.
              </p>
            </div>

            <div className="space-y-6 text-slate-300">
              <div className="flex items-start gap-4">
                <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/20">
                  <svg className="h-5 w-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-white">End-to-end privacy</h3>
                  <p className="mt-1 text-sm text-slate-400">Your conversations stay yours. No data mining, no third parties.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/20">
                  <svg className="h-5 w-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-white">For everyone</h3>
                  <p className="mt-1 text-sm text-slate-400">Chat, game, work, collaborate. With colleagues, friends, or anyone.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/20">
                  <svg className="h-5 w-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-white">Always free</h3>
                  <p className="mt-1 text-sm text-slate-400">No hidden costs, no premium tiers. Full features, forever free.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 text-sm text-slate-500">
            <p>Built with care for people who value their privacy</p>
          </div>
        </aside>

        <main className="flex flex-1 items-center justify-center px-6 py-12 lg:px-16">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-white">Welcome back</h2>
              <p className="mt-2 text-slate-400">Sign in to your workspace</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-slate-300">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={handleEmailChange}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition"
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-slate-300">
                    Password
                  </label>
                  <button type="button" className="text-sm text-violet-400 hover:text-violet-300 transition">
                    Forgot password?
                  </button>
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={handlePasswordChange}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:from-violet-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </button>

              <div className="text-center text-sm text-slate-400">
                Don't have an account?{' '}
                <Link to="/register" className="font-semibold text-violet-400 hover:text-violet-300 transition">
                  Create one for free
                </Link>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
};

export default LoginPage;