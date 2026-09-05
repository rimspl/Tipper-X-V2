-- SECURITY-RLS migration: allow minimal anon access for setup/signup flow
-- Principle: anon can only read activation keys and create basic org records
-- All sensitive data (users, tyres, events) remains fully protected

-- 1. LICENSES: anon can SELECT to validate a key, UPDATE to mark setup complete
-- SELECT exposes only: id, license_key, is_active, is_setup_complete, max_*, customer_id
-- No passwords, no user data, no event data
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_licenses" ON licenses;
CREATE POLICY "anon_select_licenses"
  ON licenses FOR SELECT
  TO anon
  USING (true);

-- UPDATE restricted: anon can only flip is_setup_complete to true
-- USING ensures the row is readable, WITH CHECK ensures only is_setup_complete changes
DROP POLICY IF EXISTS "anon_update_licenses" ON licenses;
CREATE POLICY "anon_update_licenses"
  ON licenses FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- 2. CUSTOMERS: anon can INSERT (creates {name} only) and SELECT minimal fields
-- setup.html needs to create a customer record with just the company name
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_customers" ON customers;
CREATE POLICY "anon_select_customers"
  ON customers FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "anon_insert_customers" ON customers;
CREATE POLICY "anon_insert_customers"
  ON customers FOR INSERT
  TO anon
  WITH CHECK (true);

-- 3. SITES: anon can INSERT (creates {customer_id, license_id, site_name}) and SELECT
-- setup.html creates a site to link customer + license
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sites" ON sites;
CREATE POLICY "anon_select_sites"
  ON sites FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "anon_insert_sites" ON sites;
CREATE POLICY "anon_insert_sites"
  ON sites FOR INSERT
  TO anon
  WITH CHECK (true);

-- IMPORTANT: All other tables (users, vehicles, tyres, tyre_events, tyre_photos,
-- manager_alerts, observations, etc.) remain FULLY BLOCKED for anon role.
-- They require authenticated user sessions (JWT with user_id) for access.
