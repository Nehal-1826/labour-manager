import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtMoney, fmtDate, fmtDays, todayYMD } from '../utils';
import { Modal, Spinner, ErrorBox, Empty, Badge, Avatar, Field } from './ui';

export default function Labours({ nav }) {
  const [labours, setLabours] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | labour object

  const load = () =>
    api.labours().then(setLabours).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const remove = async (l) => {
    if (!window.confirm(`Delete ${l.name}? All their attendance records will also be removed.`)) return;
    try {
      await api.deleteLabour(l.id);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (error && !labours) return <ErrorBox message={error} />;
  if (!labours) return <Spinner />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Labours</h1>
          <p className="page-sub">{labours.filter((l) => l.active).length} active · {labours.length} total</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          + Add Labour
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      {labours.length === 0 ? (
        <Empty icon="👷" title="No labours registered yet"
          sub="Add a labour, set their daily wage rates, then mark attendance every day.">
          <button className="btn btn-primary" onClick={() => setEditing('new')}>Add Labour</button>
        </Empty>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Labour</th>
                <th>Role</th>
                <th>Phone</th>
                <th>Joined</th>
                <th className="text-right">Full / ½ / ¼ Day</th>
                <th className="text-right">Total Earned</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {labours.map((l) => (
                <tr key={l.id} className={l.active ? '' : 'row-muted'}>
                  <td>
                    <div className="cell-person">
                      <Avatar name={l.name} size={34} />
                      <button className="link-btn" onClick={() => nav('profile', { id: l.id })}>{l.name}</button>
                    </div>
                  </td>
                  <td>{l.role || '—'}</td>
                  <td>{l.phone || '—'}</td>
                  <td>{fmtDate(l.join_date)}</td>
                  <td className="text-right rates-cell">
                    <span>{fmtMoney(l.wage_full)}</span>
                    <span className="muted">{fmtMoney(l.wage_half)}</span>
                    <span className="muted">{fmtMoney(l.wage_quarter)}</span>
                  </td>
                  <td className="text-right">
                    <strong>{fmtMoney(l.total_earned)}</strong>
                    <div className="muted small-text">{fmtDays(l.total_days)} worked</div>
                  </td>
                  <td>
                    <Badge tone={l.active ? 'ok' : 'none'}>{l.active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="text-right">
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => nav('profile', { id: l.id })}>View</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(l)}>Edit</button>
                      <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(l)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <LabourFormModal
          labour={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function LabourFormModal({ labour, onClose, onSaved }) {
  const isEdit = !!labour;
  const [form, setForm] = useState({
    name: labour?.name || '',
    phone: labour?.phone || '',
    role: labour?.role || '',
    join_date: labour?.join_date || todayYMD(),
    active: isEdit ? !!labour.active : true,
    wage_full: labour ? String(labour.wage_full) : '',
    wage_half: labour ? String(labour.wage_half) : '',
    wage_quarter: labour ? String(labour.wage_quarter) : '',
    notes: labour?.notes || '',
  });
  // whether half/quarter fields are following the auto-fill of the full-day wage
  const [auto, setAuto] = useState({
    half: !isEdit || Number(labour.wage_half) === Math.round(labour.wage_full * 50) / 100,
    quarter: !isEdit || Number(labour.wage_quarter) === Math.round(labour.wage_full * 25) / 100,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const setWageFull = (e) => {
    const full = e.target.value;
    setForm((f) => {
      const next = { ...f, wage_full: full };
      const n = Number(full);
      if (Number.isFinite(n) && n >= 0) {
        if (auto.half) next.wage_half = String(Math.round((n / 2) * 100) / 100);
        if (auto.quarter) next.wage_quarter = String(Math.round((n / 4) * 100) / 100);
      }
      return next;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { ...form, wage_full: Number(form.wage_full) };
      if (isEdit) await api.updateLabour(labour.id, body);
      else await api.addLabour(body);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal title={isEdit ? `Edit ${labour.name}` : 'Add Labour'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="form-row">
          <Field label="Name *">
            <input className="input" value={form.name} onChange={set('name')} placeholder="e.g. Ramesh Kumar" required autoFocus />
          </Field>
          <Field label="Phone">
            <input className="input" value={form.phone} onChange={set('phone')} placeholder="e.g. 98765 43210" />
          </Field>
        </div>

        <div className="form-row">
          <Field label="Role / Work type" hint="mason, helper…">
            <input className="input" value={form.role} onChange={set('role')} placeholder="e.g. Mason" />
          </Field>
          <Field label="Joined on">
            <input className="input" type="date" value={form.join_date} onChange={set('join_date')} max={todayYMD()} />
          </Field>
        </div>

        <div className="wage-fields">
          <Field label="Wage per Full Day *">
            <input className="input" type="number" min="0" step="0.01" value={form.wage_full}
              onChange={setWageFull} placeholder="e.g. 500" required />
          </Field>
          <Field label="Wage per Half Day" hint={auto.half ? 'auto = 50%' : 'custom'}>
            <input className="input" type="number" min="0" step="0.01" value={form.wage_half}
              onChange={(e) => { setAuto((a) => ({ ...a, half: false })); set('wage_half')(e); }} />
          </Field>
          <Field label="Wage per Quarter Day" hint={auto.quarter ? 'auto = 25%' : 'custom'}>
            <input className="input" type="number" min="0" step="0.01" value={form.wage_quarter}
              onChange={(e) => { setAuto((a) => ({ ...a, quarter: false })); set('wage_quarter')(e); }} />
          </Field>
        </div>

        <Field label="Notes">
          <textarea className="input" rows={2} value={form.notes} onChange={set('notes')}
            placeholder="Anything worth remembering…" />
        </Field>

        <label className="check">
          <input type="checkbox" checked={form.active}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
          Currently working (active)
        </label>

        {error && <ErrorBox message={error} />}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Labour'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
