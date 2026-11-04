import { useState } from 'react';
import { api } from '../api';
import { Avatar, Badge, ErrorBox, Modal } from './ui';

/* Remove Labour flow:
 * step 'choose'          -> exactly three options: Deactivate / Permanently
 *                           Remove / Cancel
 * step 'confirm-delete'  -> additional warning confirmation before the
 *                           permanent delete (which uses the database's
 *                           ON DELETE CASCADE on attendance). */
export default function RemoveLabourModal({ labour, onClose, onDeactivated, onRemoved }) {
  const [step, setStep] = useState('choose');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const deactivate = async () => {
    setBusy(true);
    setError('');
    try {
      await api.setLabourActive(labour.id, false);
      onDeactivated(labour.id);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const permanentRemove = async () => {
    setBusy(true);
    setError('');
    try {
      await api.deleteLabour(labour.id);
      onRemoved(labour.id);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (step === 'confirm-delete') {
    return (
      <Modal title="⚠️ Permanently Remove Labour" onClose={onClose}>
        <div className="confirm-warning">
          <strong>This action cannot be undone.</strong>
          <p>
            Permanently deleting <strong>{labour.name}</strong> removes their labour
            record <strong>and every attendance record</strong> from the database
            (ON DELETE CASCADE). Their wage history disappears from reports and
            dashboards forever.
          </p>
          <p className="confirm-note">
            If you only want them off the active roster, use <strong>Deactivate Labour</strong> instead —
            it keeps everything and can be reversed.
          </p>
        </div>
        <div className="remove-target card-plain">
          <Avatar name={labour.name} size={36} />
          <div>
            <div className="labour-name">{labour.name}</div>
            <div className="labour-role">{labour.role || '—'}</div>
          </div>
          <Badge tone={labour.active ? 'ok' : 'none'}>{labour.active ? 'Active' : 'Inactive'}</Badge>
        </div>
        {error && <ErrorBox message={error} />}
        <div className="modal-actions">
          <button className="btn" onClick={() => setStep('choose')} disabled={busy}>
            ← No, go back
          </button>
          <button className="btn btn-danger" onClick={permanentRemove} disabled={busy}>
            {busy ? 'Deleting…' : `Yes, permanently delete ${labour.name}`}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Remove ${labour.name}`} onClose={onClose}>
      <div className="remove-target card-plain">
        <Avatar name={labour.name} size={36} />
        <div>
          <div className="labour-name">{labour.name}</div>
          <div className="labour-role">{labour.role || '—'}</div>
        </div>
        <Badge tone={labour.active ? 'ok' : 'none'}>{labour.active ? 'Active' : 'Inactive'}</Badge>
      </div>
      <p className="remove-lead">Choose what to do with this labour:</p>

      {error && <ErrorBox message={error} />}

      <button className="remove-option" onClick={deactivate} disabled={busy}>
        <span className="remove-option-title">⏸️ Deactivate Labour</span>
        <span className="remove-option-desc">
          Keeps the labour record, attendance history, wage history and reports.
          They disappear from the dashboard and attendance until reactivated
          (Edit → “Currently working”).
        </span>
      </button>

      <button className="remove-option option-danger" onClick={() => setStep('confirm-delete')} disabled={busy}>
        <span className="remove-option-title">🗑️ Permanently Remove Labour</span>
        <span className="remove-option-desc">
          Deletes the labour record and ALL associated attendance records.
          Wage history and reports for this labour are destroyed.
          You will be asked to confirm this again.
        </span>
      </button>

      <button className="remove-option" onClick={onClose} disabled={busy}>
        <span className="remove-option-title">✖️ Cancel</span>
        <span className="remove-option-desc">Close without changing anything.</span>
      </button>
    </Modal>
  );
}
