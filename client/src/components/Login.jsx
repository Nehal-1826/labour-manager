import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Field, ErrorBox } from './ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    setError('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(
        error.message === 'Email not confirmed'
          ? 'This administrator email has not been confirmed yet. Confirm it in the Supabase dashboard (Authentication → Users), or disable email confirmation, then try again.'
          : error.message
      );
      setBusy(false);
      return;
    }

    // UX-only convenience check — the Express backend (server/auth.js) is the
    // real enforcement point and rejects non-admin accounts with 403 regardless.
    const expectedUid = import.meta.env.VITE_ADMIN_UID;
    if (expectedUid && data.user.id !== expectedUid) {
      setError('This account is not the configured administrator.');
      await supabase.auth.signOut();
      setBusy(false);
      return;
    }
    // on success, onAuthStateChange in App.jsx switches to the application view
  };

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-icon">👷</span>
          <span className="brand-name">Labour<em>Manager</em></span>
        </div>
        <h1>Administrator Login</h1>
        <p className="login-sub">Sign in to manage attendance and wages.</p>

        <Field label="Email">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            autoComplete="username"
            autoFocus
            required
          />
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </Field>

        {error && <ErrorBox message={error} />}

        <button type="submit" className="btn btn-primary login-btn" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
        <p className="login-note">Public registration is disabled — access is restricted to the administrator account.</p>
      </form>
    </div>
  );
}
