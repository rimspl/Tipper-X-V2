-- FIX: Re-GRANT anon permissions after FIX_RLS_SECURITY.sql REVOKE ALL
-- Run this in Supabase SQL Editor

-- 1. Licenses: anon needs SELECT (validate key) + UPDATE (mark setup complete)
GRANT SELECT, UPDATE ON public.licenses TO anon;

-- 2. Customers: anon needs SELECT + INSERT (create company during setup)
GRANT SELECT, INSERT ON public.customers TO anon;

-- 3. Sites: anon needs SELECT + INSERT (create site during setup)
GRANT SELECT, INSERT ON public.sites TO anon;

-- 4. Ensure DYNHAUL-DEFAULT license exists and is usable
INSERT INTO public.licenses (license_key, is_active, is_setup_complete)
VALUES ('DYNHAUL-DEFAULT', true, false)
ON CONFLICT (license_key) DO UPDATE
  SET is_active = true, is_setup_complete = false;
