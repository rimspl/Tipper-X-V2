// api/update-user-email.js
// Vercel Serverless Function to update user email in auth.users
// This is needed because only Admin API can update auth.users.email

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { userId, newEmail } = req.body;

        if (!userId || !newEmail) {
            return res.status(400).json({ error: 'Missing userId or newEmail' });
        }

        // Email format validation
        if (!newEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Initialize Supabase Admin Client
        const supabaseAdmin = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        // Update email in auth.users
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.updateUserById(
            userId,
            { email: newEmail, email_confirm: true }
        );

        if (authError) {
            console.error('Auth update error:', authError);
            return res.status(400).json({ error: authError.message });
        }

        // Note: user_profiles has no email column; email is only in auth.users
        // Profile doesn't need email update since login uses auth.users email

        return res.status(200).json({
            success: true,
            message: 'Email updated successfully'
        });

    } catch (error) {
        console.error('Update email error:', error);
        return res.status(500).json({
            error: error.message || 'Failed to update email'
        });
    }
}
