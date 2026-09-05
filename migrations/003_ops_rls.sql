begin;

grant usage on schema ops to authenticated;
grant usage on schema ops to service_role;

grant select, insert, update on ops.offline_submissions to authenticated;
grant select on ops.submission_media to authenticated;
grant select on ops.processing_jobs to authenticated;
grant select on ops.extracted_fields to authenticated;
grant select, update on ops.review_queue to authenticated;
grant select on ops.final_reports to authenticated;
grant select on ops.audit_log to authenticated;

alter table ops.offline_submissions enable row level security;
alter table ops.submission_media enable row level security;
alter table ops.processing_jobs enable row level security;
alter table ops.extracted_fields enable row level security;
alter table ops.review_queue enable row level security;
alter table ops.final_reports enable row level security;
alter table ops.audit_log enable row level security;

drop policy if exists ops_offline_submissions_select_site on ops.offline_submissions;
create policy ops_offline_submissions_select_site
on ops.offline_submissions
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and coalesce(up.is_active, true) = true
      and up.site_id = offline_submissions.site_id
  )
);

drop policy if exists ops_offline_submissions_insert_self on ops.offline_submissions;
create policy ops_offline_submissions_insert_self
on ops.offline_submissions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and coalesce(up.is_active, true) = true
      and up.site_id = offline_submissions.site_id
  )
);

drop policy if exists ops_offline_submissions_update_manager on ops.offline_submissions;
create policy ops_offline_submissions_update_manager
on ops.offline_submissions
for update
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and coalesce(up.is_active, true) = true
      and up.role = 'manager'
      and up.site_id = offline_submissions.site_id
  )
)
with check (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and coalesce(up.is_active, true) = true
      and up.role = 'manager'
      and up.site_id = offline_submissions.site_id
  )
);

drop policy if exists ops_submission_media_select_site on ops.submission_media;
create policy ops_submission_media_select_site
on ops.submission_media
for select
to authenticated
using (
  exists (
    select 1
    from ops.offline_submissions os
    join public.user_profiles up on up.site_id = os.site_id
    where os.id = submission_media.submission_id
      and up.id = auth.uid()
      and coalesce(up.is_active, true) = true
  )
);

drop policy if exists ops_processing_jobs_select_manager on ops.processing_jobs;
create policy ops_processing_jobs_select_manager
on ops.processing_jobs
for select
to authenticated
using (
  exists (
    select 1
    from ops.offline_submissions os
    join public.user_profiles up on up.site_id = os.site_id
    where os.id = processing_jobs.submission_id
      and up.id = auth.uid()
      and coalesce(up.is_active, true) = true
      and up.role = 'manager'
  )
);

drop policy if exists ops_extracted_fields_select_site on ops.extracted_fields;
create policy ops_extracted_fields_select_site
on ops.extracted_fields
for select
to authenticated
using (
  exists (
    select 1
    from ops.offline_submissions os
    join public.user_profiles up on up.site_id = os.site_id
    where os.id = extracted_fields.submission_id
      and up.id = auth.uid()
      and coalesce(up.is_active, true) = true
  )
);

drop policy if exists ops_review_queue_select_manager on ops.review_queue;
create policy ops_review_queue_select_manager
on ops.review_queue
for select
to authenticated
using (
  exists (
    select 1
    from ops.offline_submissions os
    join public.user_profiles up on up.site_id = os.site_id
    where os.id = review_queue.submission_id
      and up.id = auth.uid()
      and coalesce(up.is_active, true) = true
      and up.role = 'manager'
  )
);

drop policy if exists ops_review_queue_update_manager on ops.review_queue;
create policy ops_review_queue_update_manager
on ops.review_queue
for update
to authenticated
using (
  exists (
    select 1
    from ops.offline_submissions os
    join public.user_profiles up on up.site_id = os.site_id
    where os.id = review_queue.submission_id
      and up.id = auth.uid()
      and coalesce(up.is_active, true) = true
      and up.role = 'manager'
  )
)
with check (
  exists (
    select 1
    from ops.offline_submissions os
    join public.user_profiles up on up.site_id = os.site_id
    where os.id = review_queue.submission_id
      and up.id = auth.uid()
      and coalesce(up.is_active, true) = true
      and up.role = 'manager'
  )
);

drop policy if exists ops_final_reports_select_site on ops.final_reports;
create policy ops_final_reports_select_site
on ops.final_reports
for select
to authenticated
using (
  exists (
    select 1
    from ops.offline_submissions os
    join public.user_profiles up on up.site_id = os.site_id
    where os.id = final_reports.submission_id
      and up.id = auth.uid()
      and coalesce(up.is_active, true) = true
  )
);

drop policy if exists ops_audit_log_select_manager on ops.audit_log;
create policy ops_audit_log_select_manager
on ops.audit_log
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles up
    where up.id = auth.uid()
      and coalesce(up.is_active, true) = true
      and up.role = 'manager'
  )
);

commit;
