import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AxiosError } from 'axios';
import { invitesAPI } from '../services/api';
import { Server, ServerInvite } from '../types/index';

const InvitePage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [server, setServer] = useState<Server | null>(null);
  const [invite, setInvite] = useState<ServerInvite | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState('');

  const isAuthenticated = Boolean(localStorage.getItem('authToken'));

  useEffect(() => {
    if (!code) {
      setIsFetching(false);
      setError('Invite code is missing.');
      return;
    }

    let isMounted = true;

    const fetchInvite = async () => {
      try {
        setIsFetching(true);
        setError('');
        const response = await invitesAPI.getInvite(code);
        if (!isMounted) {
          return;
        }
        const payload = response?.data;
        if (!payload) {
          setError('Invite unavailable.');
          setServer(null);
          setInvite(null);
          return;
        }
        setServer(payload.server);
        setInvite(payload.invite);
      } catch (err) {
        if (!isMounted) {
          return;
        }
        const axiosError = err as AxiosError<{ error?: string }>;
        const serverMessage = axiosError?.response?.data?.error;
        setError(serverMessage || 'Invite not found or no longer valid.');
        setServer(null);
        setInvite(null);
      } finally {
        if (isMounted) {
          setIsFetching(false);
        }
      }
    };

    fetchInvite();

    return () => {
      isMounted = false;
    };
  }, [code]);

  const handleAcceptInvite = async () => {
    if (!code) {
      return;
    }

    if (!localStorage.getItem('authToken')) {
      sessionStorage.setItem('pendingInviteCode', code);
      navigate('/', { replace: true });
      return;
    }

    try {
      setIsAccepting(true);
      setError('');
      await invitesAPI.acceptInvite(code);
      navigate('/chat', { replace: true });
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string }>;
      const serverMessage = axiosError?.response?.data?.error;
      setError(serverMessage || 'Failed to accept invite.');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleLoginRedirect = () => {
    if (!code) {
      navigate('/');
      return;
    }
    sessionStorage.setItem('pendingInviteCode', code);
    navigate('/', { replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100 surface-grid">
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-950/90" aria-hidden="true" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl rounded-3xl border border-slate-800/80 bg-slate-950/90 shadow-2xl shadow-slate-900/40">
          <div className="border-b border-slate-800/70 bg-slate-900/70 px-6 py-4">
            <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Invite</p>
            <h1 className="mt-2 text-xl font-semibold text-white">Join your next workspace</h1>
          </div>

          <div className="space-y-6 px-6 py-8">
            {isFetching && (
              <div className="animate-pulse space-y-3">
                <div className="h-4 w-32 rounded bg-slate-800/70" />
                <div className="h-6 w-3/4 rounded bg-slate-800/60" />
                <div className="h-32 rounded-xl border border-slate-800/80 bg-slate-900/60" />
              </div>
            )}

            {!isFetching && error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-200">
                {error}
              </div>
            )}

            {!isFetching && invite && server && (
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-800/70 bg-slate-900/70 text-lg font-semibold text-primary-200">
                    {server.icon ? (
                      <img src={server.icon} alt={server.name} className="h-full w-full rounded-[18px] object-cover" />
                    ) : (
                      (server.name || 'Workspace')
                        .split(' ')
                        .filter(Boolean)
                        .map((word) => word[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase() || '??'
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs uppercase tracking-[0.35em] text-slate-500">You are invited to join</p>
                    <h2 className="mt-1 text-lg font-semibold text-white">{server.name}</h2>
                    {server.owner?.username && (
                      <p className="text-sm text-slate-400">Owned by {server.owner.username}</p>
                    )}
                  </div>
                </div>

                {server.description && (
                  <p className="text-sm leading-relaxed text-slate-300">
                    {server.description}
                  </p>
                )}

                <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 text-xs text-slate-400">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-[0.35em] text-slate-500">invite code</span>
                    <span className="font-semibold text-primary-200">{invite.code}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <span className="block text-[11px] uppercase tracking-[0.3em] text-slate-500">max uses</span>
                      <span className="mt-1 block font-semibold text-slate-200">{invite.max_uses > 0 ? invite.max_uses : 'Unlimited'}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] uppercase tracking-[0.3em] text-slate-500">expires</span>
                      <span className="mt-1 block font-semibold text-slate-200">
                        {invite.expires_at ? new Date(invite.expires_at).toLocaleString() : 'Never'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleAcceptInvite}
                    disabled={isAccepting || isFetching}
                    className="flex-1 rounded-xl bg-primary-400/90 px-4 py-3 text-sm font-semibold text-slate-950 shadow-md shadow-primary-500/30 transition hover:bg-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-200/80 disabled:cursor-not-allowed disabled:bg-primary-300/60"
                  >
                    {isAuthenticated ? (isAccepting ? 'Joining…' : 'Join server') : 'Log in to join'}
                  </button>
                  {!isAuthenticated && (
                    <button
                      type="button"
                      onClick={handleLoginRedirect}
                      className="rounded-xl border border-slate-800/70 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-primary-400/60 hover:text-primary-100"
                    >
                      Go to login
                    </button>
                  )}
                </div>

                {!isAuthenticated && (
                  <p className="text-center text-xs text-slate-400">
                    Need an account?{' '}
                    <Link
                      to="/register"
                      onClick={() => code && sessionStorage.setItem('pendingInviteCode', code)}
                      className="font-semibold text-primary-200 hover:text-primary-100"
                    >
                      Create one now
                    </Link>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvitePage;
