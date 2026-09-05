-- =====================================================================
-- DynaHaul X — Historical FITMENT RTD + Brand Backfill
-- Run in Supabase Dashboard -> SQL Editor (ops schema only reachable here)
-- Strategy (per user): derive RTD from fitment_type (new=20, old=15);
--                       anything unmatched defaults to 20. Brand -> MRF.
-- =====================================================================

-- ---------------------------------------------------------------------
-- STEP 1 (DIAGNOSTIC): confirm fitment_type is recoverable from ops
-- ---------------------------------------------------------------------
select t.id,
       split_part(t.source_pk, ':', 2) as submission_id,
       ef.field_key,
       ef.field_value
from public.tyre_activity_log t
left join ops.extracted_fields ef
  on ef.submission_id = split_part(t.source_pk, ':', 2)::uuid
where t.activity_type = 'FITMENT'
  and ef.field_key = 'fitment_type'
limit 20;

-- ---------------------------------------------------------------------
-- STEP 2: Backfill RTD from fitment_type.
--   new  -> 20/20
--   old  -> 15/15
--   null/unmatched -> 20/20  (default per decision)
-- Only touches rows that currently have null or 0 RTD.
-- ---------------------------------------------------------------------
with fit_meta as (
  select t.id as log_id,
         (select lower(
                   case jsonb_typeof(ef.field_value)
                     when 'string' then ef.field_value::text
                     when 'object' then coalesce(ef.field_value->>'value', ef.field_value::text)
                     else ef.field_value::text
                   end)
          from ops.extracted_fields ef
          where ef.submission_id = split_part(t.source_pk, ':', 2)::uuid
            and ef.field_key = 'fitment_type'
          limit 1) as ft
  from public.tyre_activity_log t
  where t.activity_type = 'FITMENT'
    and (t.rtd1 is null or t.rtd1 = 0)
)
update public.tyre_activity_log t
set rtd1 = case when fit_meta.ft like '%old%' then 15 else 20 end,
    rtd2 = case when fit_meta.ft like '%old%' then 15 else 20 end
from fit_meta
where t.id = fit_meta.log_id;

-- ---------------------------------------------------------------------
-- STEP 3: Catch any FITMENT rows not reachable via the ops join
--         (e.g. source_pk not a submission uuid) -> default 20/20.
-- ---------------------------------------------------------------------
update public.tyre_activity_log
set rtd1 = coalesce(rtd1, 20),
    rtd2 = coalesce(rtd2, 20)
where activity_type = 'FITMENT'
  and (rtd1 is null or rtd1 = 0);

-- ---------------------------------------------------------------------
-- STEP 4: Brand backfill -> MRF for blanks / 'Unknown'.
-- ---------------------------------------------------------------------
update public.tyres
set make = 'MRF'
where make is null
   or trim(make) = ''
   or make in ('Unknown');

-- ---------------------------------------------------------------------
-- VERIFY
-- ---------------------------------------------------------------------
select activity_type,
       count(*) filter (where rtd1 is null or rtd1 = 0) as still_blank_rtd,
       count(*) as total
from public.tyre_activity_log
where activity_type = 'FITMENT'
group by activity_type;

select count(*) as tyres_without_mrf
from public.tyres
where make is null or trim(make) = '' or make = 'Unknown';
