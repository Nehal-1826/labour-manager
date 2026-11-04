# 👷 Labour Manager — Attendance & Daily Wages

A full-stack system for a site admin to register labour, set their wage rates
(full / half / quarter day), mark daily attendance (including extra half or
quarter days), and see daily + weekly / monthly / yearly wages calculated
automatically.

## Quick start

```bash
npm install
npm run dev
```

- App (UI): **http://localhost:5173**
- API server: http://localhost:4000 (the UI proxies `/api` to it automatically)

Data is stored in `data/labour.db` (SQLite) — it persists across restarts.

## How wages are calculated

Each labour has three wage rates set by the admin:

| Rate | Meaning |
|---|---|
| **Full day** | wage for a complete working day |
| **Half day** | wage for half a day of work |
| **Quarter day** | wage for a quarter of a day of work |

Half/quarter rates are auto-suggested as 50% / 25% of the full-day rate but
can be overridden per labour.

Attendance per day = a **base** portion (Full / Half / Quarter / Absent)
plus an optional **extra** portion (+½ day or +¼ day) for overtime:

```
wage = rate(base portion) + rate(extra portion)
```

Examples:
- Full day + ½ extra → full-day wage **+** half-day wage
- Half day alone → half-day wage
- Quarter day + ¼ extra → quarter-day wage **+** quarter-day wage
- Absent → ₹0

## Features

- **Dashboard** — today's total wages, week/month totals, present & unmarked
  counts, and per-labour cards showing today's wage and lifetime earnings.
- **Attendance** — pick any date, mark Full / Half / Quarter / Absent per
  labour, add +½ or +¼ extra for overtime, live wage preview, notes, and
  re-marking (upsert) any day.
- **Labours** — add / edit / delete labour with contact details, role, join
  date, wage rates and active status.
- **Labour profile** — working period (years / months / days since joining),
  wage rates, wage summaries for this week / month / year / all time, and the
  full attendance history.
- **Word reports (.docx)** — download from the *Reports* page or any profile:
  - **Individual labour report** — details, wage rates, working period,
    week/month/year wage summary and full attendance history.
  - **Monthly report** — per-labour days & wages for a chosen month with a
    grand total, plus every daily entry.
  - **Yearly report** — per-labour summary plus a month-by-month totals table.

## Tech stack

- **Backend:** Node.js + Express 5, SQLite via the built-in `node:sqlite`
  module (no native dependencies needed)
- **Frontend:** React 19 + Vite, hand-written CSS
- **Dev:** single `npm run dev` runs both servers via `concurrently`

## API overview

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/dashboard` | aggregate stats for the dashboard |
| GET | `/api/labours` | list labours + today's & lifetime totals |
| POST | `/api/labours` | add labour |
| GET | `/api/labours/:id` | profile: periods, working period, history |
| GET | `/api/labours/:id/report/docx` | Word report for one labour |
| PUT | `/api/labours/:id` | update labour |
| DELETE | `/api/labours/:id` | delete labour (cascades attendance) |
| GET | `/api/attendance/:date` | all attendance records for a date |
| POST | `/api/attendance` | mark / update attendance (upsert) |
| DELETE | `/api/attendance/:labourId/:date` | remove an attendance record |
| GET | `/api/reports/monthly/:year/:month/docx` | Word report for a month |
| GET | `/api/reports/yearly/:year/docx` | Word report for a year |

Word reports are generated with the `docx` package server-side (pure JS, no
native dependencies).
