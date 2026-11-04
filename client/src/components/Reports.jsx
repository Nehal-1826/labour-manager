import { useEffect, useState } from 'react';
import { api } from '../api';
import { todayYMD } from '../utils';
import { Spinner, ErrorBox, Empty } from './ui';

export default function Reports() {
  const [labours, setLabours] = useState(null);
  const [error, setError] = useState('');
  const [labourId, setLabourId] = useState('');
  const [month, setMonth] = useState(todayYMD().slice(0, 7)); // YYYY-MM
  const [year, setYear] = useState(String(new Date().getFullYear()));

  useEffect(() => {
    api.labours().then(setLabours).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!labours) return <Spinner />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="page-sub">Download wage records as Word documents (.docx)</p>
        </div>
      </div>

      {labours.length === 0 ? (
        <Empty icon="📄" title="Nothing to report yet"
          sub="Add labours and mark attendance first — then download reports from here." />
      ) : (
        <div className="reports-grid">
          <div className="card report-card">
            <div className="report-icon">👤</div>
            <h2>Individual Labour Report</h2>
            <p className="report-desc">
              One labour's complete record: details, wage rates, working period,
              week / month / year wage summary and full attendance history.
            </p>
            <div className="report-controls">
              <select
                className="input"
                value={labourId}
                onChange={(e) => setLabourId(e.target.value)}
              >
                <option value="">Select a labour…</option>
                {labours.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}{l.role ? ` (${l.role})` : ''}</option>
                ))}
              </select>
              {labourId ? (
                <a className="btn btn-primary" href={`/api/labours/${labourId}/report/docx`}>
                  ⬇ Download Word
                </a>
              ) : (
                <button className="btn btn-primary" disabled>Select a labour first</button>
              )}
            </div>
          </div>

          <div className="card report-card">
            <div className="report-icon">📅</div>
            <h2>Monthly Report</h2>
            <p className="report-desc">
              Total record for one month: per-labour days &amp; wages summary with
              a grand total, plus every daily attendance entry of that month.
            </p>
            <div className="report-controls">
              <input
                className="input"
                type="month"
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
              />
              <a className="btn btn-primary"
                href={`/api/reports/monthly/${month.slice(0, 4)}/${month.slice(5, 7)}/docx`}>
                ⬇ Download Word
              </a>
            </div>
          </div>

          <div className="card report-card">
            <div className="report-icon">🗓️</div>
            <h2>Yearly Report</h2>
            <p className="report-desc">
              Total record for one year: per-labour days &amp; wages summary and a
              month-by-month totals table with a grand total.
            </p>
            <div className="report-controls">
              <input
                className="input"
                type="number"
                min="2000"
                max="2100"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
              <a
                className={`btn btn-primary ${Number(year) >= 2000 && Number(year) <= 2100 ? '' : 'disabled-anchor'}`}
                href={Number(year) >= 2000 && Number(year) <= 2100 ? `/api/reports/yearly/${year}/docx` : undefined}
                onClick={(e) => { if (!(Number(year) >= 2000 && Number(year) <= 2100)) e.preventDefault(); }}
              >
                ⬇ Download Word
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
