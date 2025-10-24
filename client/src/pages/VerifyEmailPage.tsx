import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { authAPI } from '../services/api';

const VerifyEmailPage: React.FC = () => {
  const location = useLocation();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');

    if (!token) {
      setStatus('error');
      setMessage('Missing verification token.');
      return;
    }

    setStatus('loading');

    authAPI
      .verifyEmail(token)
      .then((response) => {
        setStatus('success');
        setMessage(response.message);
      })
      .catch((error) => {
        console.error('Email verification error:', error);
        setStatus('error');
        setMessage('Verification failed. The link may be invalid or expired.');
      });
  }, [location.search]);

  const renderStatus = () => {
    switch (status) {
      case 'loading':
        return 'Verifying your email...';
      case 'success':
        return message || 'Email verified successfully!';
      case 'error':
        return message || 'Verification failed.';
      default:
        return '';
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-slate-100">
      <div className="terminal-card w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800/70 bg-slate-900/70 px-5 py-3">
          <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
            <span className="inline-flex gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-400/70" />
              <span className="h-2 w-2 rounded-full bg-amber-300/70" />
              <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
            </span>
            <span>verify-email.tsx</span>
          </div>
          <span className="text-[11px] uppercase tracking-[0.35em] text-slate-500">portal</span>
        </div>

        <div className="space-y-5 px-6 py-8 text-center">
          <h1 className="text-lg font-semibold text-white">Confirming your access</h1>
          <p className="text-sm text-slate-300">{renderStatus()}</p>

          {status === 'success' && (
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-400/90 px-4 py-2 text-sm font-semibold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200/80"
            >
              Continue to login
            </Link>
          )}

          {status === 'error' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Need a new link? Return to registration to request another verification email.
              </p>
              <div className="flex justify-center gap-3 text-sm">
                <Link to="/register" className="text-primary-200 hover:text-primary-100">
                  Register again
                </Link>
                <span className="text-slate-600">•</span>
                <Link to="/" className="text-primary-200 hover:text-primary-100">
                  Back to login
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
