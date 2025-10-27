import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();
  const isAuthenticated = Boolean(localStorage.getItem('authToken'));

  useEffect(() => {
    // Redirect authenticated users to chat, non-authenticated to login
    const timer = setTimeout(() => {
      if (isAuthenticated) {
        navigate('/chat', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    }, 3000); // 3 second delay to show the 404 page

    return () => clearTimeout(timer);
  }, [isAuthenticated, navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-950 via-slate-950 to-slate-950 text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-violet-900/20 via-transparent to-transparent" aria-hidden="true" />
      
      <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-6 py-12">
        <div className="text-center space-y-6">
          {/* 404 Number */}
          <div className="relative">
            <h1 className="text-9xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400 animate-pulse">
              404
            </h1>
            <div className="absolute inset-0 blur-3xl bg-gradient-to-r from-violet-600/30 to-indigo-600/30" aria-hidden="true" />
          </div>

          {/* Message */}
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold text-white">Page not found</h2>
            <p className="text-lg text-slate-400 max-w-md mx-auto">
              Sorry, we couldn't find the page you're looking for.
            </p>
          </div>

          {/* Redirect info */}
          <div className="mt-8 rounded-lg border border-slate-800/80 bg-slate-900/50 px-6 py-4 max-w-md mx-auto">
            <p className="text-sm text-slate-300">
              Redirecting you to {isAuthenticated ? 'chat' : 'login'} in a moment...
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
            {isAuthenticated ? (
              <Link
                to="/chat"
                className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:from-violet-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                Go to Chat
              </Link>
            ) : (
              <Link
                to="/"
                className="rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 font-semibold text-white shadow-lg shadow-violet-500/30 transition hover:from-violet-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                Go to Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
