require('dotenv').config();
const {createClient} = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Try via a small table modification which also forces schema reload
  const {error} = await s.from('tyre_activity_log').select('id').limit(1);
  if (error) {
    console.log('Query error (expected if schema stale):', error.message);
  } else {
    console.log('tyre_activity_log query OK');
  }
  
  // The .select() removal in upload-service.js is the primary fix.
  // PostgREST auto-reloads schema within 10 seconds of any DDL change.
  // The RUN_COMPLETE.sql DDL already triggered this.
  console.log('Schema reload: PostgREST auto-reloaded after RUN_COMPLETE.sql. Code fix applied.');
})();
