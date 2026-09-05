-- SQL Migration to Fix Duplicate Vehicle Error
-- Run this in your Supabase SQL Editor

-- 1. Drop the existing global unique constraint 
-- (This allows "MH12AB1234" to exist in multiple rows)
ALTER TABLE public.vehicles DROP CONSTRAINT vehicles_vehicle_no_key;

-- 2. Add the new Composite Unique Constraint
-- (This ensures "MH12AB1234" is still unique WITHIN "Site A", but allows it in "Site B")
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_vehicle_no_site_unique UNIQUE (vehicle_no, site_id);

-- Verification:
-- After running this, try adding the same truck number in a different site (different login). It should work.
