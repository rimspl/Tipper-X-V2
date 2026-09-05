const CORE = {

    async fetchTruckModels() {
        if (!window.supabaseClient) return [];
        const { data, error } = await window.supabaseClient
            .from('tipper_model_master')
            .select('*')
            .order('manufacturer', { ascending: true });
        return data || [];
    },

    async fetchTyreMakes() {
        if (!window.supabaseClient) return [];
        const { data, error } = await window.supabaseClient
            .from('tyre_make_master')
            .select('name')
            .order('name', { ascending: true });
        return data ? data.map(item => item.name) : [];
    },

    async fetchTyreSizes() {
        if (!window.supabaseClient) return [];
        const { data, error } = await window.supabaseClient
            .from('tyre_size_master')
            .select('size_code')
            .order('size_code', { ascending: true });
        return data ? data.map(item => item.size_code) : [];
    },

    async fetchPositionsForModel(modelId) {
        if (!window.supabaseClient) return [];
        const { data, error } = await window.supabaseClient
            .from('tipper_position_master')
            .select('position_code')
            .eq('tipper_model_id', modelId)
            .order('axle_no', { ascending: true });
        return data ? data.map(item => item.position_code) : [];
    },

    getCurrentPositions() {
        try {
            const master = JSON.parse(localStorage.getItem('rims_master_data') || '{}');
            if (master.positions && master.positions.length > 0) return master.positions;
        } catch (e) { }
        return CONFIG.volvoPositions;
    },

    populatePositions(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '<option value="">Select Position</option>';
        this.getCurrentPositions().forEach(pos => {
            select.innerHTML += '<option value="' + pos + '">' + pos + '</option>';
        });
    },

    async getTruckCurrentTyres(truckNo, siteId) {
        if (!window.supabaseClient) return null;

        if (!siteId) {
            const s = getSession();
            siteId = s.siteId;
        }
        if (!siteId) return null;

        const { data: vData } = await window.supabaseClient
            .from('vehicles')
            .select(`
                id, 
                tipper_model_id, 
                current_odometer,
                tipper_model_master ( recommended_cold_pressure )
            `)
            .eq('vehicle_no', truckNo)
            .eq('site_id', siteId)
            .maybeSingle();

        if (!vData) return null;

        let positions = [];
        if (vData.tipper_model_id) {
            positions = await this.fetchPositionsForModel(vData.tipper_model_id);
        }

        if (!positions || positions.length === 0) {
            console.warn('Truck ' + truckNo + ' has no model/positions. Using defaults.');
            positions = this.getCurrentPositions();
        }

        const { data: currentTyres } = await window.supabaseClient
            .from('tyres')
            .select('tyre_no, make, size, current_position, id')
            .eq('current_vehicle_id', vData.id);

        const state = {};
        positions.forEach(p => state[p] = null);

        if (currentTyres) {
            currentTyres.forEach(t => {
                if (t.current_position) {
                    state[t.current_position] = {
                        serial: t.tyre_no,
                        make: t.make,
                        size: t.size,
                        id: t.id
                    };
                }
            });
        }

        return {
            id: vData.id,
            modelId: vData.tipper_model_id || null,
            positions: positions,
            tyres: state,
            odometer: vData.current_odometer,
            stdPressure: vData.tipper_model_master?.recommended_cold_pressure || 100
        };
    },

    async ensureCustomer(name) {
        if (!name) return null;
        const { data } = await window.supabaseClient.from('customers').select('id').eq('name', name).maybeSingle();
        if (data) return data.id;
        const { data: nData, error } = await window.supabaseClient.from('customers').insert({ name: name }).select('id').single();
        if (error) throw error;
        return nData.id;
    },

    async ensureSite(name, customerId) {
        if (!name || !customerId) return null;
        const { data } = await window.supabaseClient.from('sites').select('id').eq('site_name', name).eq('customer_id', customerId).maybeSingle();
        if (data) return data.id;
        const { data: nData, error } = await window.supabaseClient.from('sites').insert({ site_name: name, customer_id: customerId }).select('id').single();
        if (error) throw error;
        return nData.id;
    },

    async saveOperationalMasterData(data) {
        if (!window.supabaseClient) return;

        const session = getSession();
        const userId = session.uid;

        try {
            let customerId = await this.ensureCustomer(data.customerName);
            if (!customerId) {
                const { data: nc, error: ce } = await window.supabaseClient.from('customers').insert({ name: data.customerName }).select('id').single();
                if (ce) throw ce;
                customerId = nc.id;
            }

            let siteId = await this.ensureSite(data.siteName, customerId);

            const sitePayload = {
                target_tyre_life: data.tyreLife,
                target_life_unit: data.lifeUnit,
                tyre_price: data.price,
                annual_demand: data.purchaseQty,
                fleet_size: data.tipperCount,
                default_tipper_model_id: data.modelId
            };

            const { error: siteErr } = await window.supabaseClient
                .from('sites')
                .update(sitePayload)
                .eq('id', siteId);

            if (siteErr) throw siteErr;

            if (userId) {
                const { error: userErr } = await window.supabaseClient
                    .from('user_profiles')
                    .update({
                        site_id: siteId,
                        customer_id: customerId
                    })
                    .eq('id', userId);

                if (userErr) throw userErr;
            }

            session.siteId = siteId;
            session.customerId = customerId;
            saveSession(session);

            console.log('\u2705 Master Data Linked & Saved');

        } catch (err) {
            console.error('Master Data Save Error:', err);
            throw err;
        }
    },

    async ensureVehicle(vehicleNo, siteId, tipperModelId) {
        if (!vehicleNo || !siteId) return null;

        const { data } = await window.supabaseClient
            .from('vehicles')
            .select('id')
            .eq('vehicle_no', vehicleNo)
            .eq('site_id', siteId)
            .maybeSingle();

        if (data) {
            if (tipperModelId) {
                await window.supabaseClient
                    .from('vehicles')
                    .update({ tipper_model_id: tipperModelId })
                    .eq('id', data.id);
            }
            return data.id;
        }

        const insertPayload = {
            vehicle_no: vehicleNo,
            site_id: siteId
        };
        if (tipperModelId) insertPayload.tipper_model_id = tipperModelId;

        const { data: newData, error } = await window.supabaseClient
            .from('vehicles')
            .insert(insertPayload)
            .select('id')
            .single();

        if (error) throw error;
        return newData.id;
    },

    async fetchTipperModels() {
        if (!window.supabaseClient) return [];
        const { data, error } = await window.supabaseClient
            .from('tipper_model_master')
            .select('id, manufacturer, model, axle_config, no_of_tyres, tyre_size, recommended_cold_pressure')
            .order('manufacturer', { ascending: true });

        if (error) { console.error('Error fetching tipper models:', error); return []; }
        return data || [];
    },

    async insertTipperModel(modelData) {
        if (!window.supabaseClient) throw new Error('Database offline');
        const { data, error } = await window.supabaseClient
            .from('tipper_model_master')
            .insert({
                manufacturer: modelData.manufacturer,
                model: modelData.model,
                axle_config: modelData.axle_config || null,
                no_of_tyres: modelData.no_of_tyres || null,
                tyre_size: modelData.tyre_size || null,
                recommended_cold_pressure: modelData.recommended_cold_pressure || null
            })
            .select('id')
            .single();

        if (error) throw error;
        return data.id;
    },

    async ensureTyre(tyreNo, details) {
        if (!tyreNo) return null;
        tyreNo = tyreNo.trim().toUpperCase();
        details = details || {};

        const { data } = await window.supabaseClient
            .from('tyres')
            .select('id')
            .ilike('tyre_no', tyreNo)
            .maybeSingle();

        if (data) return data.id;

        const { data: newData, error } = await window.supabaseClient
            .from('tyres')
            .insert({
                tyre_no: tyreNo,
                make: details.make || 'Unknown',
                size: details.size || 'Unknown',
                otd: details.otd || 0
            })
            .select('id')
            .single();

        if (error) throw error;
        return newData.id;
    },

    async createTyreAndFit(tyreDetails, vehicleId, position, meterReading, date) {
        if (!window.supabaseClient) throw new Error('Database offline');

        const session = getSession();
        const userId = session.uid;
        const tyreNo = tyreDetails.serial.trim().toUpperCase();

        const { data: existingTyre } = await window.supabaseClient
            .from('tyres')
            .select('id')
            .ilike('tyre_no', tyreNo)
            .maybeSingle();

        let tyreId;

        if (existingTyre) {
            tyreId = existingTyre.id;
            await window.supabaseClient
                .from('tyres')
                .update({
                    make: tyreDetails.make,
                    size: tyreDetails.size,
                    otd: tyreDetails.otd
                })
                .eq('id', tyreId);
        } else {
            const { data: newTyre, error: tyreErr } = await window.supabaseClient
                .from('tyres')
                .insert({
                    tyre_no: tyreNo,
                    make: tyreDetails.make,
                    size: tyreDetails.size,
                    otd: tyreDetails.otd,
                    status: 'Running'
                })
                .select('id')
                .single();

            if (tyreErr) throw tyreErr;
            tyreId = newTyre.id;
        }

        const { error: fitErr } = await window.supabaseClient
            .from('tyre_activity_log')
            .insert({
                activity_type: 'FITMENT',
                activity_date: date,
                tyre_id: tyreId,
                vehicle_id: vehicleId,
                position: position,
                meter_reading: meterReading,
                remarks: 'Fitted during inspection (new entry)',
                user_id: userId
            });

        if (fitErr) throw fitErr;

        await window.supabaseClient
            .from('tyres')
            .update({
                current_vehicle_id: vehicleId,
                current_position: position,
                status: 'Running'
            })
            .eq('id', tyreId);

        if (meterReading > 0) {
            await window.supabaseClient
                .from('vehicles')
                .update({ current_odometer: meterReading })
                .eq('id', vehicleId);
        }

        console.log('\u2705 New tyre ' + tyreNo + ' created and fitted to ' + position);
        return tyreId;
    },

    async save(formId, data) {
        if (!window.supabaseClient) { alert('Database offline'); return; }
        const session = getSession();
        const siteId = session.siteId;
        const userId = session.uid;

        try {
            switch (formId) {

                case 'pressure-check':
                    const pVehId = await this.ensureVehicle(data.truck, siteId);
                    const pRows = [];
                    for (const r of data.readings) {
                        const tId = await this.ensureTyre(r.tyre);
                        pRows.push({
                            activity_type: 'PRESSURE_CHECK',
                            vehicle_id: pVehId,
                            tyre_id: tId,
                            position: r.pos,
                            psi_found: r.found,
                            psi_corrected: r.corrected,
                            user_id: userId,
                            remarks: r.action
                        });
                    }
                    if (pRows.length > 0) {
                        const { error } = await window.supabaseClient.from('tyre_activity_log').insert(pRows);
                        if (error) throw error;
                    }
                    break;

                case 'tyre-inspection':
                    const iRows = [];
                    for (const r of data.inspections) {
                        const iVehId = await this.ensureVehicle(r.truck, siteId);
                        const iTyreId = await this.ensureTyre(r.tyre);

                        iRows.push({
                            activity_type: 'INSPECTION',
                            activity_date: data.date,
                            vehicle_id: iVehId,
                            tyre_id: iTyreId,
                            position: r.pos,
                            meter_reading: r.reading,
                            rtd1: r.rtd1,
                            rtd2: r.rtd2,
                            remarks: r.remarks + (r.damage ? ' [Damage: ' + r.damage + ']' : ''),
                            user_id: userId
                        });
                        if (r.reading) await window.supabaseClient.from('vehicles').update({ current_odometer: r.reading }).eq('id', iVehId);
                    }
                    if (iRows.length > 0) {
                        const { error } = await window.supabaseClient.from('tyre_activity_log').insert(iRows);
                        if (error) throw error;
                    }
                    break;

                case 'tyre-removal':
                    const remVehId = await this.ensureVehicle(data.truck, siteId);
                    const remTyreId = await this.ensureTyre(data.serial);
                    const remMeter = parseFloat(data.reading) || 0;
                    const segmentLifeRaw = parseFloat(data.life_achieved) || 0;

                    const { data: currentTyreData } = await window.supabaseClient
                        .from('tyres')
                        .select('total_life_run')
                        .eq('id', remTyreId)
                        .single();

                    const oldTotalLife = parseFloat(currentTyreData?.total_life_run) || 0;
                    const newTotalLife = oldTotalLife + segmentLifeRaw;

                    const { error: remLogErr } = await window.supabaseClient.from('tyre_activity_log').insert({
                        activity_type: 'REMOVAL',
                        activity_date: data.date,
                        vehicle_id: remVehId,
                        tyre_id: remTyreId,
                        position: data.position,
                        meter_reading: remMeter,
                        rtd1: data.rtd1,
                        rtd2: data.rtd2,
                        life_achieved_in_this_run: segmentLifeRaw,
                        removal_reason: data.status,
                        remarks: data.remarks,
                        user_id: userId
                    });
                    if (remLogErr) throw remLogErr;

                    await window.supabaseClient.from('tyres').update({
                        current_vehicle_id: null,
                        current_position: null,
                        status: data.status,
                        total_life_run: newTotalLife
                    }).eq('id', remTyreId);

                    if (remMeter > 0) await window.supabaseClient.from('vehicles').update({ current_odometer: remMeter }).eq('id', remVehId);
                    break;

                case 'tyre-card':
                    const cTyreId = await this.ensureTyre(data.tyreSerial, { make: data.make, size: data.size, otd: data.otd });

                    await window.supabaseClient.from('tyres').update({
                        make: data.make, size: data.size, otd: data.otd
                    }).eq('id', cTyreId);

                    if (data.date && data.date.length > 0) {
                        const cRows = [];
                        let lastAction = '';
                        let lastTruckId = null;
                        let lastPos = '';

                        for (let i = 0; i < data.date.length; i++) {
                            const act = data.action[i];
                            let type = 'INSPECTION';

                            if (act.toLowerCase().includes('fit')) type = 'FITMENT';
                            if (act.toLowerCase().includes('rem')) type = 'REMOVAL';

                            const tipperModelId = data.tipperModelId && data.tipperModelId[i] ? data.tipperModelId[i] : null;
                            const cVehId = await this.ensureVehicle(data.truck[i], siteId, tipperModelId);

                            lastAction = type;
                            lastTruckId = cVehId;
                            lastPos = data.pos[i];

                            cRows.push({
                                tyre_id: cTyreId,
                                vehicle_id: cVehId,
                                activity_date: data.date[i],
                                activity_type: type,
                                position: data.pos[i],
                                meter_reading: data.reading[i],
                                rtd1: data.rtd1[i],
                                rtd2: data.rtd2[i],
                                user_id: userId,
                                remarks: data.remarks ? data.remarks[i] : (data.reason ? data.reason[i] : '')
                            });

                            if (data.reading[i] > 0) {
                                await window.supabaseClient.from('vehicles').update({ current_odometer: data.reading[i] }).eq('id', cVehId);
                            }
                        }

                        if (cRows.length > 0) {
                            const { error } = await window.supabaseClient.from('tyre_activity_log').insert(cRows);
                            if (error) throw error;
                        }

                        if (lastAction === 'FITMENT' && lastTruckId && lastPos) {
                            console.log('Updating Tyre State to Fitted:', lastPos);
                            await window.supabaseClient.from('tyres').update({
                                current_vehicle_id: lastTruckId,
                                current_position: lastPos,
                                status: 'Running'
                            }).eq('id', cTyreId);
                        }
                    }
                    break;

                case 'observation':
                    const obsData = {
                        customer_id: session.customerId,
                        site_id: siteId,
                        vehicle_id: data.vehicleId || await this.ensureVehicle(data.truck || 'Unknown', siteId),
                        tyre_id: data.tyreId || null,
                        category: data.category,
                        observation_category: data.category,
                        observation_type: data.subCategory,
                        observation: data.observation,
                        severity: 'Medium'
                    };
                    const { error: obsErr } = await window.supabaseClient.from('observation_entries').insert(obsData);
                    if (obsErr) throw obsErr;
                    break;
            }

            console.log('\u2705 Saved ' + formId);

        } catch (err) {
            console.error('Save Error:', err);
            alert('Error saving to Cloud: ' + err.message);
            throw err;
        }
    },

    exportToExcel(data, filename) {
        if (typeof XLSX !== 'undefined') {
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
            XLSX.writeFile(wb, filename + '.xlsx');
        }
    },

    exportTyreMaster(data) {
        this.exportToExcel([data], 'TyreMaster');
    },

    exportToPDF(id, name) {
        if (typeof html2pdf !== 'undefined') {
            html2pdf().from(document.getElementById(id)).save(name);
        }
    }
};

window.DB = CORE;
window.CORE = CORE;
