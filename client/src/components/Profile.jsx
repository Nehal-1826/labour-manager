import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  fmtMoney, fmtDays, fmtDate, fmtRange, dayLabel, baseTone, periodText,
} from '../utils';
import { Spinner, ErrorBox, Badge, Avatar } from './ui';

export default function Profile({ id, nav }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    api.labourProfile(id).then(setData).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Spinner />;

  const { labour, periods, working_period, history } = data;

  return (
    <div className="page">
      <div className="page-toolbar">
        <button className="btn btn-ghost" onClick={() => nav('labours')}>← Back to Labours</button>
        <a className="btn btn-primary" href={`/api/labours/${labour.id}/report/docx`}>
          ⬇ Download Word Report
        </a>
      </div>

      {/* header card */}
      <div className="card profile-head">
        <Avatar name={labour.name} size={64} />
        <div className="profile-id">
          <h1>{labour.name}</h1>
          <div className="profile-meta">
            {labour.role && <span className="chip">{labour.role}</span>}
            {labour.phone && <span className="chip">📞 {labour.phone}</span>}
            <span className="chip">Joined {fmtDate(labour.join_date)}</span>
            <Badge tone={labour.active ? 'ok' : 'none'}>{labour.active ? 'Active' : 'Inactive'}</Badge>
          </div>
          {labour.notes && <p className="profile-notes">{labour.notes}</p>}
        </div>
        <div className="profile-period">
          <div className="mini-label">Working Period</div>
          <div className="period-value">{periodText(working_period)}</div>
          <div className="muted small-text">
            {fmtDate(working_period.from)} → {fmtDate(working_period.to)} · {working_period.total_days} days
          </div>
        </div>
      </div>

      {/* wage rates */}
      <div className="rates-strip card">
        <div className="rate-item">
          <span className="mini-label">Full Day</span>
          <strong>{fmtMoney(labour.wage_full)}</strong>
        </div>
        <div className="rate-item">
          <span className="mini-label">Half Day</span>
          <strong>{fmtMoney(labour.wage_half)}</strong>
        </div>
        <div className="rate-item">
          <span className="mini-label">Quarter Day</span>
          <strong>{fmtMoney(labour.wage_quarter)}</strong>
        </div>
        <div className="rate-item accent">
          <span className="mini-label">Total Earned (all time)</span>
          <strong>{fmtMoney(periods.all.amount)}</strong>
        </div>
      </div>

      {/* wage summaries */}
      <section className="section">
        <h2>Wages Summary</h2>
        <div className="period-grid">
          {[periods.week, periods.month, periods.year, periods.all].map((p) => (
            <div key={p.label} className="card period-card">
              <div className="period-label">{p.label}</div>
              <div className="period-amount">{fmtMoney(p.amount)}</div>
              <div className="period-sub">
                {fmtDays(p.days)} worked
                {p.from && <span className="muted"> · {fmtRange(p.from, p.to)}</span>}
                {!p.from && p.entries === 0 && <span className="muted"> · no records yet</span>}
              </div>
              <div className="muted small-text">{p.entries} attendance {p.entries === 1 ? 'entry' : 'entries'}</div>
            </div>
          ))}
        </div>
      </section>

      {/* attendance history */}
      <section className="section">
        <h2>Attendance History</h2>
        {history.length === 0 ? (
          <div className="card empty-card muted">No attendance marked yet.</div>
        ) : (
          <div className="card table-card">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Work Done</th>
                  <th className="text-right">Days</th>
                  <th className="text-right">Wage Earned</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{fmtDate(h.date)}</td>
                    <td><Badge tone={baseTone(h.base, h.extra)}>{dayLabel(h.base, h.extra)}</Badge></td>
                    <td className="text-right">{h.days_worked}</td>
                    <td className="text-right"><strong>{fmtMoney(h.amount)}</strong></td>
                    <td className="muted">{h.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
