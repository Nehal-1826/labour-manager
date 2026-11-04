const express = require('express');
const db = require('./db');
const requireAdmin = require('./auth');
const { buildLabourReport, buildMonthlyReport, buildYearlyReport } = require('./reports');

const app = express();
app.use(express.json());

// every /api route requires a verified administrator session (Bearer token).
// route handlers below are untouched — they only ever see authenticated requests.
app.use('/api', requireAdmin);

const PORT = process.env.PORT || 4000;

/* ---------------- date helpers (local time, YYYY-MM-DD strings) ---------------- */
const pad = (n) => String(n).padStart(2, '0');
const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => toYMD(new Date());
const parseYMD = (s) => new Date(`${s}T00:00:00`);
const isValidDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseYMD(s).getTime());

// Monday..Sunday week containing dateStr
function weekRange(dateStr) {
  const d = parseYMD(dateStr);
  const shift = d.getDay() === 0 ? -6 : 1 - d.getDay(); // back to Monday
  const mon = new Date(d);
  mon.setDate(d.getDate() + shift);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return [toYMD(mon), toYMD(sun)];
}

function monthRange(dateStr) {
  const d = parseYMD(dateStr);
  return [
    toYMD(new Date(d.getFullYear(), d.getMonth(), 1)),
    toYMD(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  ];
}

function yearRange(dateStr) {
  const y = parseYMD(dateStr).getFullYear();
  return [`${y}-01-01`, `${y}-12-31`];
}

/* ---------------- wage math ---------------- */
const round2 = (n) => Math.round(n * 100) / 100;

function rateFor(labour, fraction) {
  if (fraction === 1) return labour.wage_full;
  if (fraction === 0.5) return labour.wage_half;
  if (fraction === 0.25) return labour.wage_quarter;
  return 0;
}

// amount = rate of the day's portion + rate of the extra portion
function computeAmount(labour, base, extra) {
  return round2(rateFor(labour, base) + rateFor(labour, extra));
}

const BASE_VALUES = [1, 0.5, 0.25, 0];
const EXTRA_VALUES = [0, 0.25, 0.5];

/* ---------------- labour input validation ---------------- */
function cleanLabourInput(body) {
  const name = String(body.name || '').trim();
  if (!name) return { error: 'Name is required' };

  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? round2(n) : null;
  };

  const wage_full = num(body.wage_full);
  if (wage_full == null) return { error: 'Full-day wage must be a number of 0 or more' };

  const data = {
    name,
    phone: String(body.phone || '').trim(),
    role: String(body.role || '').trim(),
    join_date: isValidDate(body.join_date) ? body.join_date : todayStr(),
    active: body.active === undefined ? 1 : body.active ? 1 : 0,
    wage_full,
    wage_half: num(body.wage_half) ?? round2(wage_full / 2),
    wage_quarter: num(body.wage_quarter) ?? round2(wage_full / 4),
    notes: String(body.notes || '').trim(),
  };
  return { data };
}

// join_date -> today (calendar years / months / days plus total days)
function workingPeriod(labour, today) {
  const from = parseYMD(labour.join_date);
  const to = parseYMD(today);
  if (to < from) return { from: labour.join_date, to: today, years: 0, months: 0, days: 0, total_days: 0 };

  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(to.getFullYear(), to.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return {
    from: labour.join_date,
    to: today,
    years,
    months,
    days,
    total_days: Math.round((to - from) / 86400000),
  };
}

/* ---------------- labour routes ---------------- */

app.get('/api/labours', (req, res) => {
  const today = todayStr();
  const rows = db
    .prepare(
      `SELECT l.*,
        (SELECT COALESCE(SUM(amount), 0)      FROM attendance WHERE labour_id = l.id) AS total_earned,
        (SELECT COALESCE(SUM(days_worked), 0) FROM attendance WHERE labour_id = l.id) AS total_days,
        (SELECT amount      FROM attendance WHERE labour_id = l.id AND date = ?) AS today_amount,
        (SELECT days_worked FROM attendance WHERE labour_id = l.id AND date = ?) AS today_days
      FROM labours l
      ORDER BY l.active DESC, l.name COLLATE NOCASE ASC`
    )
    .all(today, today);
  res.json(rows);
});

app.post('/api/labours', (req, res) => {
  const { error, data } = cleanLabourInput(req.body);
  if (error) return res.status(400).json({ error });
  const info = db
    .prepare(
      `INSERT INTO labours (name, phone, role, join_date, active, wage_full, wage_half, wage_quarter, notes)
       VALUES (@name, @phone, @role, @join_date, @active, @wage_full, @wage_half, @wage_quarter, @notes)`
    )
    .run(data);
  res.status(201).json(db.prepare('SELECT * FROM labours WHERE id = ?').get(info.lastInsertRowid));
});

// shared aggregation used by both the profile API and the Word report export
function collectProfile(labour) {
  const today = todayStr();
  const sumRange = db.prepare(
    `SELECT COALESCE(SUM(days_worked), 0) AS days, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS entries
     FROM attendance WHERE labour_id = ? AND date >= ? AND date <= ?`
  );
  const sumAll = db.prepare(
    `SELECT COALESCE(SUM(days_worked), 0) AS days, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS entries
     FROM attendance WHERE labour_id = ?`
  );

  const [wf, wt] = weekRange(today);
  const [mf, mt] = monthRange(today);
  const [yf, yt] = yearRange(today);

  const history = db
    .prepare('SELECT * FROM attendance WHERE labour_id = ? ORDER BY date DESC, id DESC')
    .all(labour.id);

  return {
    labour,
    periods: {
      week: { label: 'This Week', from: wf, to: wt, ...sumRange.get(labour.id, wf, wt) },
      month: { label: 'This Month', from: mf, to: mt, ...sumRange.get(labour.id, mf, mt) },
      year: { label: `Year ${yt.slice(0, 4)}`, from: yf, to: yt, ...sumRange.get(labour.id, yf, yt) },
      all: { label: 'All Time', ...sumAll.get(labour.id) },
    },
    working_period: workingPeriod(labour, today),
    history,
    today,
  };
}

app.get('/api/labours/:id', (req, res) => {
  const labour = db.prepare('SELECT * FROM labours WHERE id = ?').get(req.params.id);
  if (!labour) return res.status(404).json({ error: 'Labour not found' });
  const profile = collectProfile(labour);
  res.json({
    labour: profile.labour,
    periods: profile.periods,
    working_period: profile.working_period,
    history: profile.history.slice(0, 365),
  });
});

/* ---------------- Word (.docx) report downloads ---------------- */

const sanitizeFilename = (s) => String(s).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'report';

function sendDocx(res, bufferPromise, filename) {
  return bufferPromise
    .then((buf) => {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buf);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Could not generate the report' });
    });
}

// report for one labour (all-time)
app.get('/api/labours/:id/report/docx', (req, res) => {
  const labour = db.prepare('SELECT * FROM labours WHERE id = ?').get(req.params.id);
  if (!labour) return res.status(404).json({ error: 'Labour not found' });
  const p = collectProfile(labour);
  const doc = buildLabourReport({
    labour: p.labour, periods: p.periods, working_period: p.working_period,
    history: p.history, today: p.today,
  });
  sendDocx(res, doc, `${sanitizeFilename(labour.name)}_Wage_Report_${p.today}.docx`);
});

// total records for one month (YYYY/MM)
app.get('/api/reports/monthly/:year/:month/docx', (req, res) => {
  const year = Number(req.params.year);
  const month = Number(req.params.month);
  if (!(year >= 2000 && year <= 2100) || !(month >= 1 && month <= 12)) {
    return res.status(400).json({ error: 'Invalid year or month' });
  }
  const [from, to] = monthRange(`${year}-${pad(month)}-01`);
  const summary = db.prepare(
    `SELECT l.id, l.name, l.role, COUNT(*) AS entries,
            COALESCE(SUM(a.days_worked), 0) AS days, COALESCE(SUM(a.amount), 0) AS wages
     FROM attendance a JOIN labours l ON l.id = a.labour_id
     WHERE a.date BETWEEN ? AND ?
     GROUP BY l.id ORDER BY l.name COLLATE NOCASE`
  ).all(from, to);
  const details = db.prepare(
    `SELECT a.*, l.name AS labour_name, l.role AS labour_role
     FROM attendance a JOIN labours l ON l.id = a.labour_id
     WHERE a.date BETWEEN ? AND ?
     ORDER BY l.name COLLATE NOCASE, a.date`
  ).all(from, to);
  const doc = buildMonthlyReport({ year, month, from, to, summary, details, today: todayStr() });
  sendDocx(res, doc, `Monthly_Wage_Report_${year}_${pad(month)}.docx`);
});

// total records for one year (YYYY)
app.get('/api/reports/yearly/:year/docx', (req, res) => {
  const year = Number(req.params.year);
  if (!(year >= 2000 && year <= 2100)) return res.status(400).json({ error: 'Invalid year' });
  const [from, to] = yearRange(`${year}-01-01`);
  const summary = db.prepare(
    `SELECT l.id, l.name, l.role, COUNT(*) AS entries,
            COALESCE(SUM(a.days_worked), 0) AS days, COALESCE(SUM(a.amount), 0) AS wages
     FROM attendance a JOIN labours l ON l.id = a.labour_id
     WHERE a.date BETWEEN ? AND ?
     GROUP BY l.id ORDER BY l.name COLLATE NOCASE`
  ).all(from, to);
  const monthWise = db.prepare(
    `SELECT substr(date, 1, 7) AS ym, COUNT(*) AS entries,
            COALESCE(SUM(days_worked), 0) AS days, COALESCE(SUM(amount), 0) AS wages
     FROM attendance WHERE date BETWEEN ? AND ?
     GROUP BY ym ORDER BY ym`
  ).all(from, to);
  const doc = buildYearlyReport({ year, from, to, summary, monthWise, today: todayStr() });
  sendDocx(res, doc, `Yearly_Wage_Report_${year}.docx`);
});

app.put('/api/labours/:id', (req, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT id FROM labours WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Labour not found' });
  const { error, data } = cleanLabourInput(req.body);
  if (error) return res.status(400).json({ error });
  db.prepare(
    `UPDATE labours SET name=@name, phone=@phone, role=@role, join_date=@join_date, active=@active,
       wage_full=@wage_full, wage_half=@wage_half, wage_quarter=@wage_quarter, notes=@notes
     WHERE id=@id`
  ).run({ ...data, id });
  res.json(db.prepare('SELECT * FROM labours WHERE id = ?').get(id));
});

app.delete('/api/labours/:id', (req, res) => {
  const info = db.prepare('DELETE FROM labours WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Labour not found' });
  res.json({ ok: true });
});

/* ---------------- attendance routes ---------------- */

// all attendance records for one date
app.get('/api/attendance/:date', (req, res) => {
  const date = req.params.date;
  if (!isValidDate(date)) return res.status(400).json({ error: 'Invalid date (expected YYYY-MM-DD)' });
  const records = db
    .prepare(
      `SELECT a.*, l.name AS labour_name FROM attendance a
       JOIN labours l ON l.id = a.labour_id WHERE a.date = ?`
    )
    .all(date);
  res.json({ date, records });
});

// mark / update attendance for a labour on a date (upsert)
app.post('/api/attendance', (req, res) => {
  const { labour_id, date } = req.body;
  const note = String(req.body.note || '').trim();
  if (!isValidDate(date)) return res.status(400).json({ error: 'Invalid date (expected YYYY-MM-DD)' });

  const labour = db.prepare('SELECT * FROM labours WHERE id = ?').get(labour_id);
  if (!labour) return res.status(404).json({ error: 'Labour not found' });

  const base = Number(req.body.base);
  const extra = Number(req.body.extra || 0);
  if (!BASE_VALUES.includes(base)) return res.status(400).json({ error: 'base must be 1, 0.5, 0.25 or 0' });
  if (!EXTRA_VALUES.includes(extra)) return res.status(400).json({ error: 'extra must be 0, 0.25 or 0.5' });
  if (base === 0 && extra !== 0) return res.status(400).json({ error: 'Extra time cannot be added to an absent day' });

  const days_worked = round2(base + extra);
  const amount = computeAmount(labour, base, extra);

  db.prepare(
    `INSERT INTO attendance (labour_id, date, base, extra, days_worked, amount, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(labour_id, date) DO UPDATE SET
       base = excluded.base, extra = excluded.extra,
       days_worked = excluded.days_worked, amount = excluded.amount, note = excluded.note`
  ).run(labour.id, date, base, extra, days_worked, amount, note);

  res.json(db.prepare('SELECT * FROM attendance WHERE labour_id = ? AND date = ?').get(labour.id, date));
});

// remove an attendance record entirely
app.delete('/api/attendance/:labourId/:date', (req, res) => {
  const info = db
    .prepare('DELETE FROM attendance WHERE labour_id = ? AND date = ?')
    .run(req.params.labourId, req.params.date);
  if (info.changes === 0) return res.status(404).json({ error: 'Attendance record not found' });
  res.json({ ok: true });
});

/* ---------------- dashboard ---------------- */

app.get('/api/dashboard', (req, res) => {
  const today = todayStr();
  const [wf, wt] = weekRange(today);
  const [mf, mt] = monthRange(today);

  const q = (sql, ...args) => db.prepare(sql).get(...args);
  const stats = {
    active_labours: q('SELECT COUNT(*) AS c FROM labours WHERE active = 1').c,
    total_labours: q('SELECT COUNT(*) AS c FROM labours').c,
    marked_today: q('SELECT COUNT(*) AS c FROM attendance WHERE date = ?', today).c,
    present_today: q('SELECT COUNT(*) AS c FROM attendance WHERE date = ? AND days_worked > 0', today).c,
    today_wages: q('SELECT COALESCE(SUM(amount), 0) AS s FROM attendance WHERE date = ?', today).s,
    week_wages: q('SELECT COALESCE(SUM(amount), 0) AS s FROM attendance WHERE date BETWEEN ? AND ?', wf, wt).s,
    month_wages: q('SELECT COALESCE(SUM(amount), 0) AS s FROM attendance WHERE date BETWEEN ? AND ?', mf, mt).s,
    total_wages: q('SELECT COALESCE(SUM(amount), 0) AS s FROM attendance').s,
  };
  stats.unmarked_today = Math.max(0, stats.active_labours - stats.marked_today);

  res.json({ date: today, week: { from: wf, to: wt }, month: { from: mf, to: mt }, stats });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});
