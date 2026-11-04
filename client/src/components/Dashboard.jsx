import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtMoney, fmtDays, fmtDate, todayYMD } from '../utils';
import { StatCard, Spinner, ErrorBox, Empty, Badge, Avatar } from './ui';

const statusInfo = (days) => {
  if (days === null || days === undefined) return { tone: 'none', label: 'Not marked' };
  if (days === 0) return { tone: 'absent', label: 'Absent' };
  if (days === 1) return { tone: 'full', label: 'Full Day' };
  if (days === 0.5) return { tone: 'half', label: 'Half Day' };
  if (days === 0.25) return { tone: 'quarter', label: 'Quarter Day' };
  return { tone: 'extra', label: `${days} days` };
};

export default function Dashboard({ nav }) {
  const [stats, setStats] = useState(null);
  const [labours, setLabours] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.dashboard(), api.labours()])
      .then(([d, l]) => {
        setStats(d.stats);
        setLabours(l);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!stats || !labours) return <Spinner />;

  const active = labours.filter((l) => l.active);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="page-sub">Today's attendance &amp; wages at a glance</p>
        </div>
        <button className="btn btn-primary" onClick={() => nav('attendance')}>
          Mark Attendance
        </button>
      </div>

      <div className="stat-grid">
        <StatCard label="Today's Wages" value={fmtMoney(stats.today_wages)} tone="accent"
          sub={`for ${fmtDate(todayYMD())}`} />
        <StatCard label="This Week" value={fmtMoney(stats.week_wages)} sub="wages this week" />
        <StatCard label="This Month" value={fmtMoney(stats.month_wages)} sub="wages this month" />
        <StatCard label="Active Labours" value={stats.active_labours}
          sub={`${stats.total_labours} total registered`} />
        <StatCard label="Present Today" value={stats.present_today}
          sub={`${stats.marked_today} of ${active.length} marked`} tone="green" />
        <StatCard label="Not Marked" value={stats.unmarked_today}
          sub={stats.unmarked_today ? 'pending attendance' : 'all caught up'}
          tone={stats.unmarked_today ? 'red' : 'green'} />
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Today's Wages per Labour</h2>
        </div>

        {active.length === 0 ? (
          <Empty icon="👷" title="No active labours yet"
            sub="Add your first labour to start tracking attendance and wages.">
            <button className="btn btn-primary" onClick={() => nav('labours')}>Add Labour</button>
          </Empty>
        ) : (
          <div className="labour-grid">
            {active.map((l) => {
              const marked = l.today_amount !== null && l.today_amount !== undefined;
              const status = statusInfo(l.today_days);
              return (
                <div key={l.id} className={`labour-card ${marked ? '' : 'unmarked'}`}
                  onClick={() => nav('profile', { id: l.id })}>
                  <div className="labour-card-top">
                    <Avatar name={l.name} size={42} />
                    <div className="labour-card-id">
                      <div className="labour-name">{l.name}</div>
                      <div className="labour-role">{l.role || '—'}</div>
                    </div>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <div className="labour-card-wage">
                    <div>
                      <div className="mini-label">Today's Wage</div>
                      <div className="wage-value">{marked ? fmtMoney(l.today_amount) : '—'}</div>
                    </div>
                    <div className="text-right">
                      <div className="mini-label">Total Earned</div>
                      <div className="wage-value small">{fmtMoney(l.total_earned)}</div>
                    </div>
                  </div>
                  <div className="labour-card-foot">
                    <span>{fmtDays(l.today_days ?? 0)} today · {fmtDays(l.total_days)} overall</span>
                    <button className="btn btn-ghost btn-sm"
                      onClick={(e) => { e.stopPropagation(); nav('profile', { id: l.id }); }}>
                      View →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
