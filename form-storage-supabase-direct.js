/**
 * form-storage-supabase-direct.js
 * Handles fetching data from the new Unified Schema for the UI.
 */

const DB_MANAGER = {
    // Human Readable Names
    formTypes: {
        'tyre-card': 'Tyre Master Log',
        'pressure-check': 'Pressure Check',
        'tyre-removal': 'Tyre Removal', // New Name
        'removal-fitment': 'Tyre Removal', // Backward Compatibility
        'tyre-inspection': 'Tyre Inspection',
        'observation': 'Observations'
    },

    /**
     * MAIN FETCH FUNCTION
     * Queries 'tyre_activity_log' and maps it to the UI format.
     */
    async getForms(formTypeKey, siteId = null) {
        if (!window.supabaseClient) return [];

        // Get siteId from session if not provided
        if (!siteId) {
            const session = JSON.parse(sessionStorage.getItem('rims_session') || '{}');
            siteId = session.siteId;
        }

        try {
            // 1. DETERMINE ACTIVITY TYPE BASED ON FORM ID
            let typeFilter = [];

            if (formTypeKey === 'pressure-check') {
                typeFilter = ['PRESSURE_CHECK'];
            }
            else if (formTypeKey === 'tyre-removal' || formTypeKey === 'removal-fitment') {
                typeFilter = ['REMOVAL'];
            }
            else if (formTypeKey === 'tyre-inspection') {
                typeFilter = ['INSPECTION'];
            }
            else if (formTypeKey === 'tyre-card') {
                typeFilter = ['FITMENT', 'RECAPPING'];
            }

            // 2. OBSERVATIONS ARE IN A SEPARATE TABLE
            if (formTypeKey === 'observation') {
                let query = window.supabaseClient
                    .from('observation_entries')
                    .select('*, vehicles(vehicle_no), tyres(tyre_no)')
                    .order('created_at', { ascending: false })
                    .limit(50);

                // Filter by site_id if available
                if (siteId) {
                    query = query.eq('site_id', siteId);
                }

                const { data, error } = await query;
                if (error) throw error;
                return data.map(row => ({
                    id: row.id,
                    formId: 'observation',
                    timestamp: row.created_at,
                    user: { username: 'System' },
                    data: {
                        truck: row.vehicles?.vehicle_no || 'Unknown',
                        tyreSerial: row.tyres?.tyre_no || 'N/A',
                        category: row.category,
                        subCategory: row.observation_type,
                        observation: row.observation
                    }
                }));
            }

            // 3. QUERY THE UNIFIED LOG with site filter
            let query = window.supabaseClient
                .from('tyre_activity_log')
                .select(`
                    id, created_at, activity_date, activity_type,
                    position, meter_reading, rtd1, rtd2, psi_found, psi_corrected, remarks, removal_reason,
                    tyres ( tyre_no, make, size, status ),
                    vehicles!inner ( vehicle_no, site_id ),
                    user_profiles ( username )
                `)
                .in('activity_type', typeFilter)
                .order('activity_date', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(50);

            // Filter by site_id if available
            if (siteId) {
                query = query.eq('vehicles.site_id', siteId);
            }

            const { data, error } = await query;

            if (error) throw error;

            // 4. MAP TO GENERIC UI FORMAT
            return data.map(row => {
                // Construct a generic "Data" object for the table view
                return {
                    id: row.id,
                    formId: formTypeKey,
                    timestamp: row.created_at,
                    user: { username: row.user_profiles?.username || 'User' },
                    tyre_make: row.tyres?.make, // For removal table
                    data: {
                        date: row.activity_date,
                        truck: row.vehicles?.vehicle_no || 'Store',
                        tyreSerial: row.tyres?.tyre_no || 'N/A',
                        tyre: row.tyres?.tyre_no, // Alias
                        make: row.tyres?.make, // Tyre make
                        size: row.tyres?.size, // Tyre size
                        status: row.tyres?.status, // Tyre status
                        pos: row.position,
                        action: row.activity_type,
                        reading: row.meter_reading,
                        rtd1: row.rtd1,
                        rtd2: row.rtd2,
                        found: row.psi_found,
                        corrected: row.psi_corrected,
                        reason: row.removal_reason, // Removal reason
                        remarks: row.remarks
                    }
                };
            });

        } catch (e) {
            console.error("DB Fetch Error:", e);
            return [];
        }
    },

    // --- DASHBOARD STATS (Now with site_id filter) ---
    async getDashboardStats(siteId = null) {
        if (!window.supabaseClient) return {};

        // Get siteId from session if not provided
        if (!siteId) {
            const session = JSON.parse(sessionStorage.getItem('rims_session') || '{}');
            siteId = session.siteId;
        }

        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        // Helper to count rows with site filter
        const getCounts = async (table, typeFilter = null) => {
            let totalQuery, todayQuery;

            if (table === 'tyre_activity_log' && siteId) {
                totalQuery = window.supabaseClient.from(table)
                    .select('*, vehicles!inner(site_id)', { count: 'exact', head: true })
                    .eq('vehicles.site_id', siteId);
                todayQuery = window.supabaseClient.from(table)
                    .select('*, vehicles!inner(site_id)', { count: 'exact', head: true })
                    .eq('vehicles.site_id', siteId)
                    .gte('created_at', today + 'T00:00:00');
            } else if (table === 'observation_entries' && siteId) {
                totalQuery = window.supabaseClient.from(table)
                    .select('*', { count: 'exact', head: true })
                    .eq('site_id', siteId);
                todayQuery = window.supabaseClient.from(table)
                    .select('*', { count: 'exact', head: true })
                    .eq('site_id', siteId)
                    .gte('created_at', today + 'T00:00:00');
            } else {
                totalQuery = window.supabaseClient.from(table).select('*', { count: 'exact', head: true });
                todayQuery = window.supabaseClient.from(table).select('*', { count: 'exact', head: true })
                    .gte('created_at', today + 'T00:00:00');
            }

            if (typeFilter) {
                totalQuery = totalQuery.in('activity_type', typeFilter);
                todayQuery = todayQuery.in('activity_type', typeFilter);
            }

            const [totalRes, todayRes] = await Promise.all([totalQuery, todayQuery]);
            return {
                today: todayRes.count || 0,
                total: totalRes.count || 0
            };
        };

        try {
            const [tyreCard, pressure, removal, inspection, observation] = await Promise.all([
                getCounts('tyre_activity_log', ['FITMENT', 'RECAPPING']),
                getCounts('tyre_activity_log', ['PRESSURE_CHECK']),
                getCounts('tyre_activity_log', ['REMOVAL']),
                getCounts('tyre_activity_log', ['INSPECTION']),
                getCounts('observation_entries')
            ]);

            return {
                'tyre-card': tyreCard,
                'pressure-check': pressure,
                'tyre-removal': removal,
                'removal-fitment': removal,
                'tyre-inspection': inspection,
                'observation': observation
            };
        } catch (err) {
            console.error("Dashboard Stats Fetch Error:", err);
            return {};
        }
    },

    // --- FETCH SINGLE RECORD FOR VIEW/PDF ---
    async getFormById(id) {
        // Try Activity Log First
        const { data } = await window.supabaseClient
            .from('tyre_activity_log')
            .select('*, tyres(*), vehicles(*)')
            .eq('id', id)
            .maybeSingle();

        if (data) {
            return {
                id: data.id,
                formId: 'generic',
                data: {
                    truck: data.vehicles?.vehicle_no,
                    tyreSerial: data.tyres?.tyre_no,
                    date: data.activity_date,
                    pos: data.position,
                    activity: data.activity_type,
                    reading: data.meter_reading,
                    rtd1: data.rtd1,
                    rtd2: data.rtd2,
                    found: data.psi_found,
                    corrected: data.psi_corrected,
                    remarks: data.remarks
                }
            };
        }

        // Try Observations
        const { data: obs } = await window.supabaseClient
            .from('observation_entries')
            .select('*, tyres(tyre_no), vehicles(vehicle_no)')
            .eq('id', id)
            .maybeSingle();

        if (obs) return {
            id: obs.id,
            formId: 'observation',
            data: {
                ...obs,
                tyre_no: obs.tyres?.tyre_no,
                vehicle_no: obs.vehicles?.vehicle_no
            }
        };

        return null;
    },

    // --- UPDATED HISTORY FETCH ---
    async getTyreHistory(tyreSerial) {
        if (!window.supabaseClient) return null;

        // 1. Get Tyre Master Data
        const { data: tyre } = await window.supabaseClient
            .from('tyres')
            .select('*')
            .ilike('tyre_no', tyreSerial)
            .maybeSingle();

        if (!tyre) return null;

        // 2. Get ALL Activities (Fitment, Inspection, Removal) sorted by Date
        const { data: logs } = await window.supabaseClient
            .from('tyre_activity_log')
            .select(`
                activity_date, activity_type, position, 
                meter_reading, rtd1, rtd2, remarks,
                removal_reason,
                vehicles ( 
                    vehicle_no,
                    tipper_model_master ( manufacturer, model ) 
                ),
                user_profiles ( username )
            `)
            .eq('tyre_id', tyre.id)
            .neq('activity_type', 'PRESSURE_CHECK') // Exclude Pressure Checks
            .order('activity_date', { ascending: true }) // Oldest first (Timeline)
            .order('created_at', { ascending: true });   // Tie-breaker

        // 3. Prepare Data Structure
        const combined = {
            tyreSerial: tyre.tyre_no,
            make: tyre.make,
            size: tyre.size,
            otd: tyre.otd,
            currentStatus: tyre.status, // Important for UI logic
            // Arrays for the Table
            date: [], truck: [], truckMake: [], pos: [], action: [], reading: [],
            rtd1: [], rtd2: [], life: [], wear: [], remarks: [], user: []
        };

        if (logs) {
            logs.forEach(l => {
                combined.date.push(l.activity_date);
                combined.truck.push(l.vehicles?.vehicle_no || 'Store/Scrap');

                // Construct Truck Make Label (e.g., "Volvo - FMX")
                let makeLabel = '-';
                if (l.vehicles?.tipper_model_master) {
                    const m = l.vehicles.tipper_model_master;
                    makeLabel = `${m.manufacturer || ''} ${m.model || ''}`.trim();
                }
                combined.truckMake.push(makeLabel);

                combined.pos.push(l.position || '-');
                combined.action.push(l.activity_type); // FITMENT, REMOVAL, INSPECTION
                combined.reading.push(l.meter_reading || 0);
                combined.rtd1.push(l.rtd1 || '');
                combined.rtd2.push(l.rtd2 || '');
                combined.life.push(0); // Calculated by UI
                combined.wear.push(''); // Calculated by UI

                // Smart Remarks: Combine Remarks + Removal Reason + User
                let finalRemark = l.remarks || '';
                if (l.removal_reason) finalRemark += ` [Reason: ${l.removal_reason}]`;
                combined.remarks.push(finalRemark);

                combined.user.push(l.user_profiles?.username || 'Unknown');
            });
        }

        return { id: tyre.id, formId: 'tyre-card', data: combined };
    },

    // --- UPDATED: GET MANAGER STATS (Secure & Site Specific) ---
    async getManagerStats(siteId) {
        if (!window.supabaseClient || !siteId) return {};

        const today = new Date().toISOString().split('T')[0];

        // Helper: Count with Site Filter
        const count = async (table, typeFilter) => {
            // 1. Total Count (Filtered by Site)
            let qTotal = window.supabaseClient.from(table).select('id', { count: 'exact', head: true });

            // 2. Today Count (Filtered by Site & Date)
            let qToday = window.supabaseClient.from(table).select('id', { count: 'exact', head: true })
                .gte('created_at', today + 'T00:00:00');

            // Apply Joins for Site Security
            if (table === 'tyre_activity_log') {
                // Join vehicles to check site_id
                qTotal = qTotal.not('vehicle_id', 'is', null).filter('vehicles.site_id', 'eq', siteId).select('*, vehicles!inner(site_id)');
                qToday = qToday.not('vehicle_id', 'is', null).filter('vehicles.site_id', 'eq', siteId).select('*, vehicles!inner(site_id)');

                if (typeFilter) {
                    qTotal = qTotal.in('activity_type', typeFilter);
                    qToday = qToday.in('activity_type', typeFilter);
                }
            } else if (table === 'observation_entries') {
                qTotal = qTotal.eq('site_id', siteId);
                qToday = qToday.eq('site_id', siteId);
            }

            const [rTotal, rToday] = await Promise.all([qTotal, qToday]);
            return { total: rTotal.count || 0, today: rToday.count || 0 };
        };

        // Helper: Asset Counts
        const assetCount = async (table, criteria = {}) => {
            let q = window.supabaseClient.from(table).select('id', { count: 'exact', head: true });

            if (table === 'vehicles') q = q.eq('site_id', siteId);
            if (table === 'tyres') {
                // Tyres are tricky as they don't have site_id directly. 
                // We count tyres currently fitted on trucks at this site.
                q = q.not('current_vehicle_id', 'is', null).filter('vehicles.site_id', 'eq', siteId).select('*, vehicles!inner(site_id)');
            }

            const r = await q;
            return r.count || 0;
        };

        // Helper: Get Vehicle Breakdown by Manufacturer
        const getVehicleBreakdown = async () => {
            const { data, error } = await window.supabaseClient
                .from('vehicles')
                .select('id, tipper_model_master(manufacturer)')
                .eq('site_id', siteId);

            if (error) { console.error('Vehicle breakdown error:', error); return {}; }

            // Group by manufacturer
            const breakdown = {};
            (data || []).forEach(v => {
                const mfr = v.tipper_model_master?.manufacturer || 'Unassigned';
                breakdown[mfr] = (breakdown[mfr] || 0) + 1;
            });
            return breakdown;
        };

        // Helper: Get Tyre Breakdown by Status (for ALL site tyres)
        const getTyreBreakdown = async () => {
            // Get all tyres that have ever been on vehicles at this site
            const { data, error } = await window.supabaseClient
                .from('tyres')
                .select('id, status, vehicles!tyres_current_vehicle_id_fkey(site_id)')
                .or(`vehicles.site_id.eq.${siteId},current_vehicle_id.is.null`);

            // Alternative simpler approach: Get tyres via activity log
            const { data: activityTyres, error: err2 } = await window.supabaseClient
                .from('tyre_activity_log')
                .select('tyre_id, tyres(id, status), vehicles!inner(site_id)')
                .eq('vehicles.site_id', siteId);

            if (err2) { console.error('Tyre breakdown error:', err2); return { breakdown: {}, total: 0 }; }

            // Deduplicate by tyre ID and group by status
            const uniqueTyres = {};
            (activityTyres || []).forEach(a => {
                if (a.tyres && a.tyre_id) {
                    uniqueTyres[a.tyre_id] = a.tyres.status || 'Unknown';
                }
            });

            const breakdown = {};
            Object.values(uniqueTyres).forEach(status => {
                breakdown[status] = (breakdown[status] || 0) + 1;
            });

            return { breakdown, total: Object.keys(uniqueTyres).length };
        };

        try {
            const [tyreCard, pressure, removal, inspection, observation, vehCount, tyreCount, vehicleBreakdown, tyreData] = await Promise.all([
                count('tyre_activity_log', ['FITMENT']),
                count('tyre_activity_log', ['PRESSURE_CHECK']),
                count('tyre_activity_log', ['REMOVAL']),
                count('tyre_activity_log', ['INSPECTION']),
                count('observation_entries'),
                assetCount('vehicles'),
                assetCount('tyres'),
                getVehicleBreakdown(),
                getTyreBreakdown()
            ]);

            return {
                forms: {
                    'tyre-card': tyreCard,
                    'pressure-check': pressure,
                    'tyre-removal': removal,
                    'tyre-inspection': inspection,
                    'observation': observation
                },
                assets: {
                    vehicles: vehCount,
                    tyres: tyreCount,
                    vehicleBreakdown: vehicleBreakdown,
                    tyreBreakdown: tyreData.breakdown, // NEW: { 'Running': 52, 'Spare': 10, ... }
                    totalTyres: tyreData.total // NEW: Total unique tyres at site
                }
            };
        } catch (err) {
            console.error("Manager Stats Error:", err);
            return null;
        }
    },

    // --- UPDATED: GET REPOSITORY DATA (Secure Site Filter) ---
    async getFormsForManager(formTypeKey, siteId) {
        if (!window.supabaseClient || !siteId) return [];

        // SPECIAL CASE: Tyre Card shows inventory (unique tyres)
        if (formTypeKey === 'tyre-card') {
            return await this.getSiteTyreInventory(siteId);
        }

        let typeFilter = [];
        if (formTypeKey === 'pressure-check') typeFilter = ['PRESSURE_CHECK'];
        if (formTypeKey === 'tyre-removal') typeFilter = ['REMOVAL'];
        if (formTypeKey === 'tyre-inspection') typeFilter = ['INSPECTION'];
        if (formTypeKey === 'tyre-card') typeFilter = ['FITMENT'];

        // Observations (Direct Table)
        if (formTypeKey === 'observation') {
            const { data, error } = await window.supabaseClient
                .from('observation_entries')
                .select('*, vehicles(vehicle_no), tyres(tyre_no)') // Ensure tyres join is explicit
                .eq('site_id', siteId)
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) throw error;
            return data.map(row => ({
                id: row.id, formId: 'observation', timestamp: row.created_at,
                data: {
                    truck: row.vehicles?.vehicle_no || 'Unknown',
                    tyreSerial: row.tyres?.tyre_no || 'N/A',
                    category: row.category,
                    subCategory: row.observation_type || row.subCategory || '-',
                    observation: row.observation,
                    remarks: row.severity || '-' // Use severity or another field if remarks doesn't exist? Schema says 'observation' is the main text. 
                    // Wait, user said remarks is missing. In repository.html, renderTable uses d.observation for the "Details" column.
                    // The user might be looking for a 'Remarks' column? The Observation grid has 'Details'. 
                    // Let's check repository.html again. It renders: <td>${d.observation}</td>
                }
            }));
        }

        // Activity Log (Unified Table)
        const { data, error } = await window.supabaseClient
            .from('tyre_activity_log')
            .select(`
                id, created_at, activity_date, activity_type,
                position, meter_reading, rtd1, rtd2, psi_found, psi_corrected, remarks,
                life_achieved_in_this_run,
                removal_reason,
                tyres ( tyre_no, make, size, total_life_run ),
                vehicles!inner ( vehicle_no, site_id ), 
                user_profiles ( username )
            `)
            .eq('vehicles.site_id', siteId) // CRITICAL SECURITY FILTER
            .in('activity_type', typeFilter)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        return data.map(row => ({
            id: row.id,
            formId: formTypeKey,
            timestamp: row.created_at,
            user: { username: row.user_profiles?.username || 'User' },
            tyre_make: row.tyres?.make,
            data: {
                date: row.activity_date,
                truck: row.vehicles?.vehicle_no,
                tyre: row.tyres?.tyre_no,
                make: row.tyres?.make, // Added MAKE for Removal History
                pos: row.position,
                action: row.activity_type,
                reading: row.meter_reading,
                life: row.life_achieved_in_this_run || row.tyres?.total_life_run || 0,
                reason: row.removal_reason, // <--- DIRECT MAPPING
                rtd1: row.rtd1,
                rtd2: row.rtd2,
                found: row.psi_found,
                corrected: row.psi_corrected,
                remarks: row.remarks
            }
        }));
    },

    // --- NEW: FETCH UNIQUE TYRE INVENTORY FOR MANAGER ---
    async getSiteTyreInventory(siteId) {
        if (!window.supabaseClient || !siteId) return [];

        // 1. Find all tyres that have ever had activity at this site
        // Include meter_reading and life_achieved_in_this_run for life calculation
        const { data: logs, error } = await window.supabaseClient
            .from('tyre_activity_log')
            .select(`
                tyre_id, activity_date, activity_type, rtd1, rtd2, meter_reading, life_achieved_in_this_run,
                tyres ( id, tyre_no, make, size, status, current_position, current_vehicle_id, total_life_run ),
                vehicles!inner ( site_id, vehicle_no )
            `)
            .eq('vehicles.site_id', siteId)
            .order('activity_date', { ascending: true })
            .order('created_at', { ascending: true }); // Tie-breaker for same-day activities

        if (error) { console.error(error); return []; }

        // 2. Aggregate Stats & Extract Unique Tyres
        const uniqueTyres = {};
        const tyreStats = {};

        logs.forEach(log => {
            if (!log.tyres) return;
            const tId = log.tyre_id;

            // Save Master Data (latest overwrites previous, which is fine)
            uniqueTyres[tId] = log.tyres;

            // Initialize Stats
            if (!tyreStats[tId]) {
                tyreStats[tId] = {
                    fitDate: null,
                    inspectDate: null,
                    rtd1: '-',
                    rtd2: '-',
                    // Life calculation variables (same logic as history modal)
                    totalLife: 0,
                    segmentStartMeter: 0,
                    currentTruck: null
                };
            }

            const stats = tyreStats[tId];
            const reading = parseFloat(log.meter_reading) || 0;
            const truck = log.vehicles?.vehicle_no || 'Store';

            // Update Latest Fitment Date & Life Calculation
            if (log.activity_type === 'FITMENT') {
                stats.fitDate = log.activity_date;
                // Start new segment on vehicle
                stats.segmentStartMeter = reading;
                stats.currentTruck = truck;
            }

            // Life Calculation Logic (same as history modal)
            if (log.activity_type === 'REMOVAL') {
                // On removal, calculate segment life
                if (stats.currentTruck === truck && reading >= stats.segmentStartMeter) {
                    stats.totalLife += (reading - stats.segmentStartMeter);
                }
                // Or use the stored life_achieved_in_this_run if available
                if (log.life_achieved_in_this_run) {
                    stats.totalLife = (parseFloat(log.tyres.total_life_run) || 0);
                }
                stats.currentTruck = null;
                stats.segmentStartMeter = 0;
            }

            // For running tyres, track current meter for live calculation
            if (log.activity_type === 'INSPECTION' && stats.currentTruck === truck) {
                // Update segment meter to latest inspection reading
                if (reading > stats.segmentStartMeter) {
                    stats.lastKnownMeter = reading;
                }
            }

            // Update Latest RTD Data (Check BOTH Inspection AND Removal)
            if ((log.activity_type === 'INSPECTION' || log.activity_type === 'REMOVAL') && (log.rtd1 || log.rtd2)) {
                stats.rtd1 = log.rtd1 || '-';
                stats.rtd2 = log.rtd2 || '-';
            }

            // Capture latest Inspection Date specifically
            if (log.activity_type === 'INSPECTION') {
                stats.inspectDate = log.activity_date;
            }
        });

        // 3. Calculate final life for running tyres (add current segment)
        Object.keys(tyreStats).forEach(tId => {
            const stats = tyreStats[tId];
            // If tyre is still on a truck (has currentTruck), add the current segment
            if (stats.currentTruck && stats.lastKnownMeter && stats.lastKnownMeter > stats.segmentStartMeter) {
                stats.totalLife += (stats.lastKnownMeter - stats.segmentStartMeter);
            }
        });

        // 4. Get Current Truck Numbers for these tyres
        const tyreList = Object.values(uniqueTyres);
        const vehicleIds = tyreList.map(t => t.current_vehicle_id).filter(id => id);

        const vehMap = {};
        if (vehicleIds.length > 0) {
            const { data: vehs } = await window.supabaseClient
                .from('vehicles')
                .select('id, vehicle_no')
                .in('id', vehicleIds);

            if (vehs) vehs.forEach(v => vehMap[v.id] = v.vehicle_no);
        }

        // 5. Map back to tyre list
        tyreList.forEach(t => {
            // Show truck number only for Running tyres, show '-' for Spare/Repair/etc
            t.current_vehicle_no = vehMap[t.current_vehicle_id] || (t.status === 'Running' ? 'Unknown' : '-');
        });

        // 6. Format for Repository View with CALCULATED LIFE
        return tyreList.map(t => {
            const stats = tyreStats[t.id] || { fitDate: '-', inspectDate: '-', rtd1: '-', rtd2: '-', totalLife: 0 };

            // Use calculated totalLife, fallback to total_life_run from DB
            const calculatedLife = stats.totalLife || t.total_life_run || 0;

            return {
                id: t.id,
                formId: 'tyre-card-master', // Special ID to trigger Inventory View
                data: {
                    tyreSerial: t.tyre_no,
                    make: t.make,
                    size: t.size,
                    status: t.status,
                    truck: t.current_vehicle_no,
                    pos: t.current_position || '-',
                    life: Math.round(calculatedLife), // Use dynamically calculated life
                    // New Fields
                    fitmentDate: stats.fitDate || '-',
                    inspectionDate: stats.inspectDate || '-',
                    rtd1: stats.rtd1,
                    rtd2: stats.rtd2
                }
            };
        });
    }
};

// Expose
window.DB_MANAGER = DB_MANAGER;