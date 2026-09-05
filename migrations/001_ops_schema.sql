begin;

create extension if not exists pgcrypto;
create schema if not exists ops;

create or replace function ops.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists ops.offline_submissions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  device_id text not null,
  local_submission_id text not null,
  form_type text not null check (form_type in (
    'tyre_card',
    'pressure_check',
    'tyre_inspection',
    'tyre_removal',
    'observation'
  )),
  site_id uuid not null,
  user_id uuid not null,
  context_json jsonb not null default '{}'::jsonb,
  capture_started_at timestamptz,
  capture_completed_at timestamptz,
  sync_status text not null default 'registered' check (sync_status in (
    'registered',
    'uploading',
    'uploaded',
    'failed'
  )),
  processing_status text not null default 'queued' check (processing_status in (
    'queued',
    'running',
    'needs_review',
    'completed',
    'failed'
  )),
  app_version text,
  schema_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, local_submission_id, form_type)
);

drop trigger if exists trg_offline_submissions_updated_at on ops.offline_submissions;
create trigger trg_offline_submissions_updated_at
before update on ops.offline_submissions
for each row
execute function ops.touch_updated_at();

create table if not exists ops.submission_media (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references ops.offline_submissions(id) on delete cascade,
  step_id text not null,
  storage_path text not null,
  media_kind text not null check (media_kind in ('image', 'video', 'audio')),
  sha256 text not null,
  captured_at timestamptz,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ops.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references ops.offline_submissions(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued' check (status in (
    'queued',
    'running',
    'completed',
    'failed',
    'retry_wait'
  )),
  attempt_count int not null default 0,
  last_error text,
  next_run_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, job_type)
);

drop trigger if exists trg_processing_jobs_updated_at on ops.processing_jobs;
create trigger trg_processing_jobs_updated_at
before update on ops.processing_jobs
for each row
execute function ops.touch_updated_at();

create table if not exists ops.extracted_fields (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references ops.offline_submissions(id) on delete cascade,
  field_key text not null,
  field_value jsonb not null,
  confidence numeric(5,4),
  source_media_id uuid references ops.submission_media(id) on delete set null,
  created_at timestamptz not null default now(),
  check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create table if not exists ops.review_queue (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references ops.offline_submissions(id) on delete cascade,
  reason text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'pending' check (status in (
    'pending',
    'in_progress',
    'resolved',
    'rejected'
  )),
  assigned_to uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists ops.final_reports (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references ops.offline_submissions(id) on delete cascade,
  final_payload jsonb not null,
  approval_mode text not null check (approval_mode in (
    'auto',
    'manager_approved',
    'manager_corrected'
  )),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists ops.audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  actor_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

commit;
