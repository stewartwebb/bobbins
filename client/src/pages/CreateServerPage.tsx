import React, { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { serversAPI } from '../services/api';

const CreateServerPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'details' | 'invite'>('details');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDetailsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Server name is required.');
      return;
    }

    try {
      setIsLoading(true);
      const response = await serversAPI.createServer({ name, description, icon });
      const invite = response.data?.default_invite;
      if (invite?.invite_url) {
        setInviteLink(invite.invite_url);
      }
      setStep('invite');
    } catch (err) {
      setError('Failed to create server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate('/chat');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 surface-grid">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl rounded-3xl border border-slate-800/70 bg-slate-950/90 shadow-2xl shadow-slate-900/40">
          <div className="border-b border-slate-800/60 bg-slate-900/60 px-6 py-4">
            <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Create Workspace</p>
            <h1 className="mt-2 text-xl font-semibold text-white">{step === 'details' ? 'Workspace details' : 'Invite your crew'}</h1>
          </div>

          {step === 'details' ? (
            <form onSubmit={handleDetailsSubmit} className="space-y-5 px-6 py-8">
              <div>
                <label htmlFor="name" className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Server Name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-100 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300/60"
                  placeholder="Product Team"
                />
              </div>

              <div>
                <label htmlFor="description" className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Description
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-100 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300/60"
                  placeholder="Give your team an identity and mission."
                />
              </div>

              <div>
                <label htmlFor="icon" className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Icon URL
                </label>
                <input
                  id="icon"
                  type="url"
                  value={icon}
                  onChange={(event) => setIcon(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-100 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300/60"
                  placeholder="https://assets.bafachat.app/product-team.png"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="rounded-xl bg-primary-400/90 px-5 py-2 text-sm font-semibold text-slate-950 shadow-md shadow-primary-500/20 transition hover:bg-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-200/80 disabled:cursor-not-allowed disabled:bg-primary-300/60"
                >
                  {isLoading ? 'Creating…' : 'Next: Invite friends'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleInviteSubmit} className="space-y-5 px-6 py-8">
              <div className="rounded-xl border border-slate-800/70 bg-slate-900/60 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Invite link</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-sm text-primary-100">{inviteLink}</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(inviteLink)}
                    className="rounded-lg border border-primary-400/60 px-3 py-1 text-xs font-semibold text-primary-200 transition hover:border-primary-200 hover:text-primary-100"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="emails" className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Email invites (comma separated)
                </label>
                <textarea
                  id="emails"
                  value={inviteEmails}
                  onChange={(event) => setInviteEmails(event.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-100 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300/60"
                  placeholder="teammate@bafachat.app, collaborator@studio.dev"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <button
                  type="button"
                  onClick={() => setStep('details')}
                  className="font-semibold text-slate-400 transition hover:text-primary-200"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-400/90 px-5 py-2 text-sm font-semibold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200/80"
                >
                  Finish setup
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateServerPage;
