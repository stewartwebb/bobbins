import React, { useState, ChangeEvent, FormEvent, useRef, useEffect } from 'react';
import { AxiosError } from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const navigateTimeout = useRef<number>();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      await authAPI.register({ username, email, password });
      setSuccess('Registration successful! Check your inbox to verify your email address.');
      setUsername('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');

      navigateTimeout.current = window.setTimeout(() => {
        navigate('/');
      }, 4000);
    } catch (err) {
      console.error('Registration error:', err);
      const axiosError = err as AxiosError<{ error?: string }>;
      const serverMessage = axiosError?.response?.data?.error;
      setError(serverMessage || 'Registration failed. Try a different email or username.');
    } finally {
      setIsLoading(false);
    }
  };

  const onChange = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    setter(event.target.value);
  };

  useEffect(() => {
    return () => {
      if (navigateTimeout.current) {
        window.clearTimeout(navigateTimeout.current);
      }
    };
  }, []);

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
                Join thousands creating their own private workspace. Chat, game, work — all in one place.
              </p>
            </div>

            <div className="space-y-6 text-slate-300">
              <div className="flex items-start gap-4">
                <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/20">
                  <svg className="h-5 w-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-white">100% Free Forever</h3>
                  <p className="mt-1 text-sm text-slate-400">No trials, no premium plans. Full access to everything, always.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/20">
                  <svg className="h-5 w-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-white">Your data is yours</h3>
                  <p className="mt-1 text-sm text-slate-400">No tracking, no selling your information. Complete privacy guaranteed.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/20">
                  <svg className="h-5 w-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-white">Everything you need</h3>
                  <p className="mt-1 text-sm text-slate-400">Voice, video, screen share, file sharing. Built for teams of any size.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 text-sm text-slate-500">
            <p>A better way to connect with the people who matter</p>
          </div>
        </aside>

        <main className="flex flex-1 items-center justify-center px-6 py-12 lg:px-16">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-white">Create your account</h2>
              <p className="mt-2 text-slate-400">Get started for free, no credit card required</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium text-slate-300">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={onChange(setUsername)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition"
                  placeholder="yourname"
                />
              </div>

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
                  onChange={onChange(setEmail)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition"
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-slate-300">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={onChange(setPassword)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition"
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="confirm-password" className="text-sm font-medium text-slate-300">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={onChange(setConfirmPassword)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-3 text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:from-violet-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? 'Creating account...' : 'Create free account'}
              </button>

              <div className="text-center text-sm text-slate-400">
                Already have an account?{' '}
                <Link to="/" className="font-semibold text-violet-400 hover:text-violet-300 transition">
                  Sign in
                </Link>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
};

export default RegisterPage;
