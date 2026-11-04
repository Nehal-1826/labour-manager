/* ---------- money & number formatting ---------- */

export const fmtMoney = (n) =>
  `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const fmtDays = (n) => {
  const v = Number(n || 0);
  const text = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, '');
  return `${text} ${v === 1 ? 'day' : 'days'}`;
};

/* ---------- date helpers ---------- */

const pad = (n) => String(n).padStart(2, '0');

export const todayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const fmtDate = (ymd) => {
  if (!ymd) return '—';
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const fmtDateShort = (ymd) => {
  if (!ymd) return '—';
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/* ---------- attendance / wage logic (mirrors server rules) ---------- */

export const BASE_OPTIONS = [
  { value: 1, label: 'Full Day', tone: 'full' },
  { value: 0.5, label: 'Half Day', tone: 'half' },
  { value: 0.25, label: 'Quarter Day', tone: 'quarter' },
  { value: 0, label: 'Absent', tone: 'absent' },
];

export const EXTRA_OPTIONS = [
  { value: 0.25, label: '+ ¼ Day' },
  { value: 0.5, label: '+ ½ Day' },
];

const BASE_NAMES = { 1: 'Full Day', 0.5: 'Half Day', 0.25: 'Quarter Day', 0: 'Absent' };

export const rateFor = (labour, fraction) => {
  if (fraction === 1) return labour.wage_full;
  if (fraction === 0.5) return labour.wage_half;
  if (fraction === 0.25) return labour.wage_quarter;
  return 0;
};

export const computeAmount = (labour, base, extra) =>
  Math.round((rateFor(labour, base) + rateFor(labour, extra)) * 100) / 100;

export const dayLabel = (base, extra) => {
  if (base === null || base === undefined) return 'Not marked';
  const b = BASE_NAMES[base] ?? `${base} Day`;
  if (!extra) return b;
  return `${b} + ${extra === 0.5 ? '½' : '¼'} extra`;
};

export const baseTone = (base, extra) => {
  if (base === null || base === undefined) return 'none';
  if (base === 0) return 'absent';
  if (extra) return 'extra';
  if (base === 1) return 'full';
  if (base === 0.5) return 'half';
  return 'quarter';
};

/* ---------- misc ---------- */

export const periodText = (p) => {
  if (!p) return '';
  const parts = [];
  if (p.years) parts.push(`${p.years} year${p.years === 1 ? '' : 's'}`);
  if (p.months) parts.push(`${p.months} month${p.months === 1 ? '' : 's'}`);
  if (p.days || parts.length === 0)
    parts.push(`${p.days} day${p.days === 1 ? '' : 's'}`);
  return parts.join(' ');
};

export const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

export const fmtRange = (from, to) => `${fmtDateShort(from)} – ${fmtDateShort(to)}`;
