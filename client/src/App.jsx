import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import Dashboard from './components/Dashboard';
import Attendance from './components/Attendance';
import Labours from './components/Labours';
import Profile from './components/Profile';
import Reports from './components/Reports';
import Login from './components/Login';
import { Spinner } from './components/ui';
import { todayYMD, fmtDate } from './utils';

const NAV = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'labours', label: 'Labours' },
  { key: 'reports', label: 'Reports' },
];

export default function App() {
  // undefined = still checking the stored session, null = signed out, object = signed in
  const [session, setSession] = useState(undefined);
  const [route, setRoute] = useState({ view: 'dashboard', params: {} });
  const nav = (view, params = {}) => setRoute({ view, params });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) setRoute({ view: 'dashboard', params: {} });
    });

    // api.js fires this when the backend returns 401
    const forceLogout = () => setSession(null);
    window.addEventListener('auth:logout', forceLogout);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener('auth:logout', forceLogout);
    };
  }, []);

  if (session === undefined) return <Spinner />;
  if (!session) return <Login />;

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setRoute({ view: 'dashboard', params: {} });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={() => nav('dashboard')}>
          <span className="brand-icon">👷</span>
          <span className="brand-name">
            Labour<em>Manager</em>
          </span>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.key}
              className={`nav-btn ${route.view === item.key || (route.view === 'profile' && item.key === 'labours') ? 'active' : ''}`}
              onClick={() => nav(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <div className="topbar-date">{fmtDate(todayYMD())}</div>
          <span className="user-chip" title={session.user.email}>{session.user.email}</span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
        </div>
      </header>

      <main className="container">
        {route.view === 'dashboard' && <Dashboard nav={nav} />}
        {route.view === 'attendance' && <Attendance />}
        {route.view === 'labours' && <Labours nav={nav} />}
        {route.view === 'reports' && <Reports />}
        {route.view === 'profile' && <Profile id={route.params.id} nav={nav} />}
      </main>
    </div>
  );
}
