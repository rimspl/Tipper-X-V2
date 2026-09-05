begin;

-- Fix idempotent upsert support for tyre_activity_log.
-- PostgREST uses `ON CONFLICT (columns)` without an index predicate,
-- so the unique index must be non-partial.

drop index if exists public.idx_tyre_activity_source_unique;

create unique index if not exists idx_tyre_activity_source_unique
  on public.tyre_activity_log (source_type, source_pk, activity_type, projection_version);

commit;
