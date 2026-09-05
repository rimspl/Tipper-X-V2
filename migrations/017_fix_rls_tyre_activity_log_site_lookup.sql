-- Migration 017: Fix RLS on tyre_activity_log
-- Problem: The authenticated SELECT policy joins tyres.site_id with user_profiles.site_id,
--          but tyres table has NO site_id column. This silently blocks ALL authenticated reads.
-- Fix: Route through the vehicles table to resolve site_id correctly.
-- Run this in Supabase SQL Editor or via CLI.

-- Drop the broken policy
DROP POLICY IF EXISTS "authenticated_select_tyre_activity_log" ON public.tyre_activity_log;

-- Recreate with correct JOIN through vehicles table
CREATE POLICY "authenticated_select_tyre_activity_log" ON public.tyre_activity_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tyres t
      LEFT JOIN public.vehicles v ON v.id = t.current_vehicle_id OR v.id = tyre_activity_log.vehicle_id
      JOIN public.user_profiles up ON up.site_id = v.site_id
      WHERE up.id = auth.uid()
        AND coalesce(up.is_active, true) = true
        AND t.id = tyre_activity_log.tyre_id
    )
  );
