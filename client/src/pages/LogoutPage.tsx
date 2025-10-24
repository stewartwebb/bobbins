import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';

const LogoutPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const performLogout = async () => {
      try {
        await authAPI.logout();
      } catch (error) {
        // Ignore logout errors to ensure client state clears.
        console.warn('Logout request failed', error);
      } finally {
        if (!isMounted) {
          return;
        }
        localStorage.removeItem('authToken');
        localStorage.removeItem('authTokenExpiresAt');
        navigate('/', { replace: true });
      }
    };

    performLogout();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/90 to-slate-900/80" aria-hidden="true" />
      <div className="relative z-10 flex flex-col items-center gap-4 rounded-3xl border border-slate-800/70 bg-slate-950/80 px-8 py-10 shadow-2xl">
        <div className="h-3 w-3 animate-ping rounded-full bg-primary-300" />
        <h1 className="text-lg font-semibold text-white">Signing you out…</h1>
        <p className="max-w-xs text-center text-sm text-slate-400">
          Hang tight while we terminate your session and sweep any cached credentials.
        </p>
      </div>
    </div>
  );
};

export default LogoutPage;
