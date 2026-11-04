import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  fmtMoney, fmtDays, todayYMD, BASE_OPTIONS, EXTRA_OPTIONS, computeAmount, dayLabel, baseTone,
} from '../utils';
import { Spinner, ErrorBox, Empty, Avatar, Badge } from './ui';

export default function Attendance() {
  const [date, setDate] = useState(todayYMD());
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    setRows(null);
    Promise.all([api.labours(), api.attendance(date)])
      .then(([labs, att]) => {
        const byId = new Map(att.records.map((r) => [r.labour_id, r]));
        setRows(
          labs
            .filter((l) => l.active)
            .map((l) => {
              const r = byId.get(l.id);
              return {
                labour: l,
                base: r ? r.base : null,
                extra: r ? r.extra : 0,
                note: r ? r.note || '' : '',
                saved: r ? { base: r.base, extra: r.extra, note: r.note || '', amount: r.amount } : null,
              };
            })
        );
      })
      .catch((e) => setError(e.message));
  }, [date]);

  const setRow = (id, patch) =>
    setRows((rs) => rs.map((r) => (r.labour.id === id ? { ...r, ...patch } : r)));

  const chooseBase = (row, value) =>
    setRow(row.labour.id, { base: value, extra: value === 0 ? 0 : row.extra || 0 });

  const toggleExtra = (row, value) =>
    setRow(row.labour.id, { extra: row.extra === value ? 0 : value });

  const isDirty = (row) => {
    if (row.base === null) return false;
    if (!row.saved) return true;
    return (
      row.base !== row.saved.base ||
      row.extra !== row.saved.extra ||
      row.note !== row.saved.note
    );
  };

  const save = async (row) => {
    setSavingId(row.labour.id);
    try {
      const rec = await api.markAttendance({
        labour_id: row.labour.id,
        date,
        base: row.base,
        extra: row.extra,
        note: row.note,
      });
      setRow(row.labour.id, {
        saved: { base: rec.base, extra: rec.extra, note: rec.note || '', amount: rec.amount },
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  const clear = async (row) => {
    setSavingId(row.labour.id);
    try {
      await api.clearAttendance(row.labour.id, date);
      setRow(row.labour.id, { base: null, extra: 0, note: '', saved: null });
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  if (error && !rows) return <ErrorBox message={error} />;
  if (!rows) return <Spinner />;

  const marked = rows.filter((r) => r.saved);
  const totalWages = marked.reduce((s, r) => s + (r.saved.amount || 0), 0);
  const presentCount = marked.filter((r) => r.saved.base > 0).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Attendance</h1>
          <p className="page-sub">Mark how long each labour worked — wages are calculated automatically</p>
        </div>
        <div className="date-picker">
          <label htmlFor="att-date">Date</label>
          <input id="att-date" type="date" value={date} max={todayYMD()} onChange={(e) => setDate(e.target.value || todayYMD())} />
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {rows.length === 0 ? (
        <Empty icon="📋" title="No active labours" sub="Add labours first to mark attendance." />
      ) : (
        <>
          <div className="att-summary card">
            <div>
              <span className="mini-label">Marked</span>
              <strong>{marked.length} / {rows.length}</strong>
            </div>
            <div>
              <span className="mini-label">Present</span>
              <strong>{presentCount}</strong>
            </div>
            <div>
              <span className="mini-label">Absent</span>
              <strong>{marked.length - presentCount}</strong>
            </div>
            <div className="att-total">
              <span className="mini-label">Total Wages ({date === todayYMD() ? 'today' : 'this date'})</span>
              <strong>{fmtMoney(totalWages)}</strong>
            </div>
          </div>

          <div className="att-list">
            {rows.map((row) => {
              const l = row.labour;
              const dirty = isDirty(row);
              const preview =
                row.base === null ? null : computeAmount(l, row.base, row.extra);
              const daysPreview = row.base === null ? null : row.base + (row.extra || 0);
              return (
                <div key={l.id} className={`att-row card ${row.saved && !dirty ? 'saved' : ''}`}>
                  <div className="att-person">
                    <Avatar name={l.name} size={38} />
                    <div>
                      <div className="labour-name">{l.name}</div>
                      <div className="labour-role">{l.role || '—'}</div>
                    </div>
                  </div>

                  <div className="att-controls">
                    <div className="seg">
                      {BASE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          className={`seg-btn seg-${opt.tone} ${row.base === opt.value ? 'selected' : ''}`}
                          onClick={() => chooseBase(row, opt.value)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className={`att-extra ${row.base !== null && row.base > 0 ? '' : 'disabled'}`}>
                      <span className="mini-label">Extra time</span>
                      <div className="seg extra">
                        {EXTRA_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            className={`seg-btn seg-extra-btn ${row.extra === opt.value ? 'selected' : ''}`}
                            disabled={row.base === null || row.base === 0}
                            onClick={() => toggleExtra(row, opt.value)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <input
                      className="att-note"
                      type="text"
                      placeholder="Note (optional)"
                      value={row.note}
                      onChange={(e) => setRow(l.id, { note: e.target.value })}
                    />
                  </div>

                  <div className="att-result">
                    {row.base === null ? (
                      <span className="muted">Not marked</span>
                    ) : (
                      <>
                        <span className="att-days">{fmtDays(daysPreview)}</span>
                        <span className="att-amount">{fmtMoney(preview)}</span>
                        <Badge tone={baseTone(row.base, row.extra)}>{dayLabel(row.base, row.extra)}</Badge>
                      </>
                    )}
                  </div>

                  <div className="att-actions">
                    {row.saved && (
                      <Badge tone={dirty ? 'pending' : 'ok'}>
                        {dirty ? 'Unsaved changes' : `Saved · ${fmtMoney(row.saved.amount)}`}
                      </Badge>
                    )}
                    {row.saved && dirty && (
                      <button className="btn btn-ghost btn-sm" onClick={() => clear(row)}>
                        Clear
                      </button>
                    )}
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!dirty || savingId === l.id}
                      onClick={() => save(row)}
                    >
                      {savingId === l.id ? 'Saving…' : row.saved ? 'Update' : 'Save'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
