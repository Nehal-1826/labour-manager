import { useEffect, useState } from 'react';
import { initials } from '../utils';

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-card ${wide ? 'wide' : ''}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatCard({ label, value, sub, tone }) {
  return (
    <div className={`stat-card ${tone ? `tone-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
    </div>
  );
}

export function ErrorBox({ message }) {
  return <div className="error-box">⚠ {message}</div>;
}

export function Empty({ icon = '📋', title, sub, children }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}

export function Badge({ tone, children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

const AVATAR_COLORS = ['#4f46e5', '#0d9488', '#d97706', '#dc2626', '#7c3aed', '#0369a1', '#059669', '#db2777'];

export function Avatar({ name, size = 40 }) {
  let hash = 0;
  for (const ch of name || '') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return (
    <div className="avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>
      {initials(name || '?')}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">
        {label} {hint && <em className="field-hint">{hint}</em>}
      </span>
      {children}
    </label>
  );
}
