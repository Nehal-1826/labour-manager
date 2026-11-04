-- ============================================================
-- 001_supabase_schema.sql — Phase 2: Labour Manager x Supabase
--
-- Run ONCE in: Supabase Dashboard -> SQL Editor -> New query -> Run
--
-- Safe to run multiple times (idempotent). Does NOT drop or
-- recreate tables, and does not change any existing data.
--
-- What it does:
--   1. Adds UNIQUE (labour_id, date) on attendance if missing
--      (required by the application's attendance upsert).
--   2. Adds the two indexes used by hot query paths, if missing.
--   3. Adds the foreign key attendance.labour_id ->
--      labours(id) ON DELETE CASCADE if missing.
--   4. Enables Row Level Security on both tables (no public
--      policies), so the data is never exposed through the public
--      REST API. NOTE: the Node backend connects with a privileged
--      role, which BYPASSES RLS by design — API authorization is
--      enforced by the backend admin middleware, never by RLS.
--   5. Verifies columns, types, primary keys, identity/default
--      configuration and the foreign key, reporting NOTICE for ok
--      items and WARNING for mismatches.
-- ============================================================

-- ------------------------------------------------------------
-- 1. UNIQUE (labour_id, date) on attendance, if missing.
--    Detection uses pg_get_constraintdef (normalized, lowercase)
--    so the exact definition is compared safely.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.attendance') IS NULL THEN
    RAISE WARNING 'table public.attendance does not exist — skipping unique-constraint check';
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.attendance')
      AND contype = 'u'
      AND lower(pg_get_constraintdef(oid)) = 'unique (labour_id, date)'
  ) THEN
    ALTER TABLE public.attendance
      ADD CONSTRAINT attendance_labour_id_date_unique UNIQUE (labour_id, date);
    RAISE NOTICE 'added constraint: attendance_labour_id_date_unique UNIQUE (labour_id, date)';
  ELSE
    RAISE NOTICE 'ok: unique constraint on (labour_id, date) already exists';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. indexes used by hot query paths
-- ------------------------------------------------------------
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_attendance_date   ON public.attendance (date);
  CREATE INDEX IF NOT EXISTS idx_attendance_labour ON public.attendance (labour_id);
  RAISE NOTICE 'ok: indexes idx_attendance_date / idx_attendance_labour present';
END $$;

-- ------------------------------------------------------------
-- 3. foreign key attendance.labour_id -> labours(id),
--    ON DELETE CASCADE — added only if missing. Non-destructive:
--    if it cannot be added (e.g. orphan rows), the script reports
--    a warning instead of failing or changing data.
-- ------------------------------------------------------------
DO $$
DECLARE
  fk_missing boolean;
BEGIN
  SELECT NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = to_regclass('public.attendance')
      AND c.contype = 'f'
      AND c.confrelid = to_regclass('public.labours')
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.conrelid
          AND a.attnum = ANY (c.conkey)
          AND a.attname = 'labour_id'
      )
  ) INTO fk_missing;

  IF fk_missing THEN
    BEGIN
      ALTER TABLE public.attendance
        ADD CONSTRAINT attendance_labour_id_fkey
        FOREIGN KEY (labour_id) REFERENCES public.labours (id) ON DELETE CASCADE;
      RAISE NOTICE 'added foreign key: attendance_labour_id_fkey (ON DELETE CASCADE)';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'could not add foreign key (%). Verify manually — the application expects ON DELETE CASCADE.', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'ok: foreign key attendance.labour_id -> labours(id) already exists';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4. enable Row Level Security (no public policies)
-- ------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.labours    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
  RAISE NOTICE 'ok: RLS enabled on labours and attendance (no public policies)';
END $$;

-- ------------------------------------------------------------
-- 5. verification: columns, types, primary keys, identity
--    configuration, foreign key behaviour, RLS.
--    Non-destructive: read-only catalog checks + NOTICE/WARNING.
-- ------------------------------------------------------------
DO $$
DECLARE
  rec record;
  v_type text;
  v_def text;
  v_id_identity text;
  v_id_default text;
  v_att_id smallint;
  v_lab_id smallint;
  v_fk_oid oid;
  v_del_type "char";
  v_fk_def text;
  v_rls boolean;
  v_warnings int := 0;
BEGIN
  -- stop early (with a warning) if a required table does not exist
  IF to_regclass('public.labours') IS NULL THEN
    RAISE WARNING 'table public.labours does not exist — create it first';
    v_warnings := v_warnings + 1;
  END IF;
  IF to_regclass('public.attendance') IS NULL THEN
    RAISE WARNING 'table public.attendance does not exist — create it first';
    v_warnings := v_warnings + 1;
  END IF;

  IF v_warnings = 0 THEN
    -- 5a. expected columns and type families
    FOR rec IN
      SELECT * FROM (VALUES
        ('labours',    'id',            '(bigint|integer|smallint)'),
        ('labours',    'name',          '(text|character varying|character|citext)'),
        ('labours',    'phone',         '(text|character varying|character|citext)'),
        ('labours',    'role',          '(text|character varying|character|citext)'),
        ('labours',    'join_date',     '(date|text|character varying)'),
        ('labours',    'active',        '(boolean|smallint|integer)'),
        ('labours',    'wage_full',     '(numeric|real|double precision|bigint|integer|smallint)'),
        ('labours',    'wage_half',     '(numeric|real|double precision|bigint|integer|smallint)'),
        ('labours',    'wage_quarter',  '(numeric|real|double precision|bigint|integer|smallint)'),
        ('labours',    'notes',         '(text|character varying|character)'),
        ('labours',    'created_at',    '(timestamp with time zone|timestamp without time zone|text)'),
        ('attendance', 'id',            '(bigint|integer|smallint)'),
        ('attendance', 'labour_id',     '(bigint|integer|smallint)'),
        ('attendance', 'date',          '(date|text|character varying)'),
        ('attendance', 'base',          '(numeric|real|double precision|bigint|integer|smallint)'),
        ('attendance', 'extra',         '(numeric|real|double precision|bigint|integer|smallint)'),
        ('attendance', 'days_worked',   '(numeric|real|double precision|bigint|integer|smallint)'),
        ('attendance', 'amount',        '(numeric|real|double precision|bigint|integer|smallint)'),
        ('attendance', 'note',          '(text|character varying|character)')
      ) AS expected(tbl, col, type_family)
    LOOP
      SELECT format_type(a.atttypid, NULL) INTO v_type
      FROM pg_attribute a
      WHERE a.attrelid = to_regclass('public.' || rec.tbl)
        AND a.attname = rec.col
        AND NOT a.attisdropped;

      IF v_type IS NULL THEN
        RAISE WARNING 'column %.% is MISSING', rec.tbl, rec.col;
        v_warnings := v_warnings + 1;
      ELSIF v_type !~ ('^(' || rec.type_family || ')$') THEN
        RAISE WARNING 'column %.% has type % (expected one of: %)', rec.tbl, rec.col, v_type, rec.type_family;
        v_warnings := v_warnings + 1;
      ELSE
        RAISE NOTICE 'column %.% : %', rec.tbl, rec.col, v_type;
      END IF;
    END LOOP;

    -- 5b. primary keys — must be EXACTLY on (id); composite or
    --     mis-mapped primary keys are reported as mismatches
    SELECT lower(pg_get_constraintdef(oid)) INTO v_def
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.labours') AND contype = 'p'
    LIMIT 1;

    IF v_def IS NULL THEN
      RAISE WARNING 'table labours has NO primary key';
      v_warnings := v_warnings + 1;
    ELSIF v_def = 'primary key (id)' THEN
      RAISE NOTICE 'ok: primary key on labours exactly (id)';
    ELSE
      RAISE WARNING 'primary key on labours is not exactly (id): % (composite or mis-mapped constraints are reported as mismatches)', v_def;
      v_warnings := v_warnings + 1;
    END IF;

    SELECT lower(pg_get_constraintdef(oid)) INTO v_def
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.attendance') AND contype = 'p'
    LIMIT 1;

    IF v_def IS NULL THEN
      RAISE WARNING 'table attendance has NO primary key';
      v_warnings := v_warnings + 1;
    ELSIF v_def = 'primary key (id)' THEN
      RAISE NOTICE 'ok: primary key on attendance exactly (id)';
    ELSE
      RAISE WARNING 'primary key on attendance is not exactly (id): % (composite or mis-mapped constraints are reported as mismatches)', v_def;
      v_warnings := v_warnings + 1;
    END IF;

    -- 5c. id generation: identity column or a default must exist,
    --     because application INSERTs do not supply id values
    SELECT a.attidentity, pg_get_expr(d.adbin, d.adrelid)
      INTO v_id_identity, v_id_default
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = to_regclass('public.labours') AND a.attname = 'id';

    IF v_id_identity IN ('a', 'd') THEN
      RAISE NOTICE 'ok: labours.id is an identity column (%)', v_id_identity;
    ELSIF v_id_default IS NOT NULL THEN
      RAISE NOTICE 'ok: labours.id has a default: %', v_id_default;
    ELSE
      RAISE WARNING 'labours.id has neither identity nor a default — future INSERTs that omit id will fail';
      v_warnings := v_warnings + 1;
    END IF;

    SELECT a.attidentity, pg_get_expr(d.adbin, d.adrelid)
      INTO v_id_identity, v_id_default
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = to_regclass('public.attendance') AND a.attname = 'id';

    IF v_id_identity IN ('a', 'd') THEN
      RAISE NOTICE 'ok: attendance.id is an identity column (%)', v_id_identity;
    ELSIF v_id_default IS NOT NULL THEN
      RAISE NOTICE 'ok: attendance.id has a default: %', v_id_default;
    ELSE
      RAISE WARNING 'attendance.id has neither identity nor a default — future INSERTs that omit id will fail';
      v_warnings := v_warnings + 1;
    END IF;

    -- 5d. foreign key — must map EXACTLY attendance(labour_id) -> labours(id)
    --     with ON DELETE CASCADE. Composite or mis-mapped foreign keys are
    --     reported as mismatches, not accepted.
    SELECT a.attnum INTO v_att_id
    FROM pg_attribute a
    WHERE a.attrelid = to_regclass('public.attendance')
      AND a.attname = 'labour_id' AND NOT a.attisdropped;

    SELECT a.attnum INTO v_lab_id
    FROM pg_attribute a
    WHERE a.attrelid = to_regclass('public.labours')
      AND a.attname = 'id' AND NOT a.attisdropped;

    v_fk_oid = NULL;
    IF v_att_id IS NOT NULL AND v_lab_id IS NOT NULL THEN
      SELECT c.oid, c.confdeltype, lower(pg_get_constraintdef(c.oid))
        INTO v_fk_oid, v_del_type, v_fk_def
      FROM pg_constraint c
      WHERE c.conrelid = to_regclass('public.attendance')
        AND c.contype = 'f'
        AND c.confrelid = to_regclass('public.labours')
        AND c.conkey = ARRAY[v_att_id]::smallint[]   -- exactly [labour_id]
        AND c.confkey = ARRAY[v_lab_id]::smallint[]  -- exactly [labours.id]
      LIMIT 1;
    END IF;

    IF v_fk_oid IS NOT NULL AND v_del_type = 'c' THEN
      RAISE NOTICE 'ok: foreign key maps exactly attendance(labour_id) -> labours(id) ON DELETE CASCADE';
    ELSIF v_fk_oid IS NOT NULL THEN
      RAISE WARNING 'foreign key maps the right columns but ON DELETE is not CASCADE (%): % — deleting a labour will not remove its attendance rows', v_del_type, v_fk_def;
      v_warnings := v_warnings + 1;
    ELSE
      IF EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = to_regclass('public.attendance')
          AND c.contype = 'f'
          AND c.confrelid = to_regclass('public.labours')
      ) THEN
        SELECT pg_get_constraintdef(oid) INTO v_fk_def
        FROM pg_constraint c
        WHERE c.conrelid = to_regclass('public.attendance')
          AND c.contype = 'f'
          AND c.confrelid = to_regclass('public.labours')
        LIMIT 1;
        RAISE WARNING 'foreign key % does not map exactly attendance(labour_id) -> labours(id) (composite or mis-mapped) — the application requires the exact single-column mapping with ON DELETE CASCADE', v_fk_def;
      ELSE
        RAISE WARNING 'foreign key attendance(labour_id) -> labours(id) ON DELETE CASCADE is missing';
      END IF;
      v_warnings := v_warnings + 1;
    END IF;
  END IF;

  -- 5e. RLS confirmation
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = to_regclass('public.labours');
  IF v_rls THEN RAISE NOTICE 'ok: RLS enabled on labours';
  ELSE RAISE WARNING 'RLS is NOT enabled on labours'; v_warnings := v_warnings + 1;
  END IF;

  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = to_regclass('public.attendance');
  IF v_rls THEN RAISE NOTICE 'ok: RLS enabled on attendance';
  ELSE RAISE WARNING 'RLS is NOT enabled on attendance'; v_warnings := v_warnings + 1;
  END IF;

  IF v_warnings > 0 THEN
    RAISE WARNING 'schema check completed with % warning(s) — review above', v_warnings;
  ELSE
    RAISE NOTICE 'schema check passed with no warnings';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 6. sanity report: current row counts (informational)
-- ------------------------------------------------------------
DO $$
DECLARE
  l_count bigint;
  a_count bigint;
BEGIN
  SELECT COUNT(*) INTO l_count FROM public.labours;
  SELECT COUNT(*) INTO a_count FROM public.attendance;
  RAISE NOTICE 'current row counts — labours: %, attendance: %', l_count, a_count;
END $$;
