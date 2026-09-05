const DATA_CACHE = {
  healthScore: null,
  ageDistribution: null,
  defectTrend: null,
  removalReasons: null,
  healthScorePromise: null,
  agePromise: null,
  defectPromise: null,
  removalPromise: null,
  lastFetch: 0
};

const CACHE_TTL_MS = 120_000;

function getSupabase() {
  if (typeof window !== 'undefined' && window.__supabase) {
    return window.__supabase;
  }
  if (typeof window !== 'undefined' && window.supabaseClient) {
    return window.supabaseClient;
  }
  throw new Error('Supabase client not found. Ensure supabase-init.js is loaded.');
}

function isCacheValid() {
  return DATA_CACHE.lastFetch > 0 && (Date.now() - DATA_CACHE.lastFetch) < CACHE_TTL_MS;
}

function cacheResult(key, data) {
  DATA_CACHE[key] = data;
  DATA_CACHE.lastFetch = Date.now();
  return data;
}

function dedupe(key, fetcher) {
  const promiseKey = `${key}Promise`;
  if (DATA_CACHE[promiseKey]) {
    return DATA_CACHE[promiseKey];
  }
  if (isCacheValid() && DATA_CACHE[key] !== null) {
    return Promise.resolve(DATA_CACHE[key]);
  }
  DATA_CACHE[promiseKey] = fetcher().then(result => {
    DATA_CACHE[promiseKey] = null;
    return cacheResult(key, result);
  }).catch(err => {
    DATA_CACHE[promiseKey] = null;
    throw err;
  });
  return DATA_CACHE[promiseKey];
}

export function invalidateCache() {
  DATA_CACHE.lastFetch = 0;
  DATA_CACHE.healthScore = null;
  DATA_CACHE.ageDistribution = null;
  DATA_CACHE.defectTrend = null;
  DATA_CACHE.removalReasons = null;
}

export function fetchFleetHealthScore(siteId) {
  return dedupe('healthScore', async () => {
    const supabase = getSupabase();
    let query = supabase.from('v_fleet_health_score').select('*');
    if (siteId) {
      query = query.eq('site_id', siteId);
    }
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw new Error(`Fleet health fetch failed: ${error.message}`);
    return data || {
      health_score: null,
      pressure_compliance_score: null,
      life_remaining_score: null,
      inspection_recency_score: null,
      leakage_loss_score: null,
      defect_rate_score: null,
      total_tyres_with_pressure: 0,
      avg_life_usage_pct: null,
      tyres_inspected_last_7d: 0,
      avg_pressure_drop_psi: null,
      recent_defect_count: 0,
      computed_at: null
    };
  });
}

export function fetchTyreAgeDistribution(siteId) {
  return dedupe('ageDistribution', async () => {
    const supabase = getSupabase();
    let query = supabase.from('v_tyre_age_distribution').select('*');
    if (siteId) {
      query = query.eq('site_id', siteId);
    }
    const { data, error } = await query.order('age_bucket');
    if (error) throw new Error(`Age distribution fetch failed: ${error.message}`);
    return data || [];
  });
}

export function fetchDefectTrend(siteId) {
  return dedupe('defectTrend', async () => {
    const supabase = getSupabase();
    let query = supabase.from('v_defect_trend_by_position').select('*');
    if (siteId) {
      query = query.eq('site_id', siteId);
    }
    const { data, error } = await query.limit(50);
    if (error) throw new Error(`Defect trend fetch failed: ${error.message}`);
    return data || [];
  });
}

export function fetchRemovalReasons(siteId) {
  return dedupe('removalReasons', async () => {
    const supabase = getSupabase();
    let query = supabase.from('v_removal_reasons_pie').select('*');
    if (siteId) {
      query = query.eq('site_id', siteId);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Removal reasons fetch failed: ${error.message}`);
    return data || [];
  });
}
