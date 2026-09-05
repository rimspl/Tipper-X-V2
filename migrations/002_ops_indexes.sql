begin;

create unique index if not exists idx_ops_submission_media_unique_step
  on ops.submission_media (submission_id, step_id);

create index if not exists idx_ops_offline_submissions_site_form_created
  on ops.offline_submissions (site_id, form_type, created_at desc);

create index if not exists idx_ops_offline_submissions_sync_processing
  on ops.offline_submissions (sync_status, processing_status);

create index if not exists idx_ops_offline_submissions_user_created
  on ops.offline_submissions (user_id, created_at desc);

create index if not exists idx_ops_offline_submissions_context_gin
  on ops.offline_submissions using gin (context_json);

create index if not exists idx_ops_submission_media_submission
  on ops.submission_media (submission_id, created_at desc);

create index if not exists idx_ops_submission_media_step
  on ops.submission_media (step_id);

create index if not exists idx_ops_processing_jobs_status_next_run
  on ops.processing_jobs (status, next_run_at);

create index if not exists idx_ops_processing_jobs_submission
  on ops.processing_jobs (submission_id, created_at desc);

create index if not exists idx_ops_extracted_fields_submission
  on ops.extracted_fields (submission_id, field_key);

create index if not exists idx_ops_review_queue_status_priority_created
  on ops.review_queue (status, priority, created_at asc);

create index if not exists idx_ops_review_queue_submission
  on ops.review_queue (submission_id, created_at desc);

create index if not exists idx_ops_final_reports_submission
  on ops.final_reports (submission_id, created_at desc);

create index if not exists idx_ops_final_reports_payload_gin
  on ops.final_reports using gin (final_payload);

create index if not exists idx_ops_audit_log_entity
  on ops.audit_log (entity_type, entity_id, created_at desc);

create index if not exists idx_ops_audit_log_event_created
  on ops.audit_log (event_type, created_at desc);

commit;
