import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const licenseId = req.query.license_id || req.body?.license_id;

        if (!licenseId) {
            return res.status(400).json({ error: 'license_id is required' });
        }

        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        const { data: users, error } = await supabaseAdmin
            .from('user_profiles')
            .select('id, username, full_name, email, role, user_type, site_id, customer_id, license_id, is_active, created_at')
            .eq('license_id', licenseId)
            .order('user_type', { ascending: true })
            .order('username', { ascending: true });

        if (error) throw error;

        return res.status(200).json({ success: true, users: users || [] });

    } catch (error) {
        console.error('List users error:', error);
        return res.status(500).json({ error: error.message || 'Failed to list users' });
    }
}
