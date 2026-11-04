import { useState } from 'react';
import Dashboard from './components/Dashboard';
import Attendance from './components/Attendance';
import Labours from './components/Labours';
import Profile from './components/Profile';
import Reports from './components/Reports';
import { todayYMD, fmtDate } from './utils';

const NAV = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'labours', label: 'Labours' },
  { key: 'reports', label: 'Reports' },
];

export default function App() {
  const [route, setRoute] = useState({ view: 'dashboard', params: {} });
  const nav = (view, params = {}) => setRoute({ view, params });

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
        <div className="topbar-date">{fmtDate(todayYMD())}</div>
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
