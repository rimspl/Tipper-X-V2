import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { action, userId, updates } = req.body;

        if (!action || !userId) {
            return res.status(400).json({ error: 'action and userId are required' });
        }

        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        let result;

        switch (action) {
            case 'update_profile': {
                const { username, email, user_type, role } = updates || {};
                const payload = {};
                if (username) payload.username = username;
                if (email) payload.email = email;
                if (user_type) payload.user_type = user_type;
                if (role) payload.role = role;

                const { error } = await supabaseAdmin
                    .from('user_profiles')
                    .update(payload)
                    .eq('id', userId);
                if (error) throw error;
                result = { success: true, message: 'User updated' };
                break;
            }

            case 'toggle_active': {
                const { is_active } = updates || {};
                const { error } = await supabaseAdmin
                    .from('user_profiles')
                    .update({ is_active: is_active })
                    .eq('id', userId);
                if (error) throw error;
                result = { success: true, message: is_active ? 'User resumed' : 'User paused' };
                break;
            }

            case 'delete': {
                const { error } = await supabaseAdmin
                    .from('user_profiles')
                    .delete()
                    .eq('id', userId);
                if (error) throw error;

                await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});

                result = { success: true, message: 'User deleted' };
                break;
            }

            default:
                return res.status(400).json({ error: 'Unknown action: ' + action });
        }

        return res.status(200).json(result);

    } catch (error) {
        console.error('Manage user error:', error);
        return res.status(500).json({ error: error.message || 'Failed to manage user' });
    }
}
