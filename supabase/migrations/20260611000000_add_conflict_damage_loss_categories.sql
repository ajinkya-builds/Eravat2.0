-- QA L-6: Add grain, human_injury, and human_death to the
-- conflict_damages.category enum so the report flow can record these losses
-- and the admin dashboards can populate their KPIs.
--
-- The enum type was created in the base schema (its name is not pinned in
-- this repo's migrations), so resolve it dynamically from the column.
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS is idempotent; on PG 12+ it may run
-- inside a transaction as long as the new values are not used in the same
-- transaction (they are not — the app writes them only after deploy).
--
-- DEPLOY ORDER: apply this migration BEFORE releasing the app build that
-- introduces the new loss types, otherwise syncs containing them will fail
-- (and retry) until the enum values exist.

DO $$
DECLARE
  enum_type regtype;
BEGIN
  SELECT a.atttypid::regtype
    INTO enum_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
   WHERE n.nspname = 'public'
     AND c.relname = 'conflict_damages'
     AND a.attname = 'category'
     AND t.typtype = 'e';

  IF enum_type IS NULL THEN
    -- Column is plain text (or table missing): nothing to extend.
    RAISE NOTICE 'conflict_damages.category is not an enum; no values added.';
    RETURN;
  END IF;

  EXECUTE format('ALTER TYPE %s ADD VALUE IF NOT EXISTS %L', enum_type, 'grain');
  EXECUTE format('ALTER TYPE %s ADD VALUE IF NOT EXISTS %L', enum_type, 'human_injury');
  EXECUTE format('ALTER TYPE %s ADD VALUE IF NOT EXISTS %L', enum_type, 'human_death');
END $$;
