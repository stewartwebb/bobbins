import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { LoginPage, ChatPage, RegisterPage, VerifyEmailPage, CreateServerPage, InvitePage, LogoutPage, NotFoundPage } from './pages';

const App: React.FC = () => {
  return (
    <Router>
      <div className="min-h-screen bg-slate-950 bg-sky-gradient surface-grid text-slate-100">
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/create-server" element={<CreateServerPage />} />
          <Route path="/invite/:code" element={<InvitePage />} />
          <Route path="/logout" element={<LogoutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;