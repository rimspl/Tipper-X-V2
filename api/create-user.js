// api/create-user.js
// Vercel Serverless Function to create users securely
// Uses Supabase service_role key to bypass email confirmation

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
        const { email, password, name, role, user_type, site_id, customer_id, license_id } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Email format validation
        if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Password length validation
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }


        // Initialize Supabase Admin Client (uses service_role key)
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

        // Create user in auth.users (bypasses email confirmation)
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true, // Auto-confirm email
            user_metadata: {
                full_name: name,
                role: role,
                user_type: user_type
            }
        });

        if (authError) {
            // Check if user already exists
            if (authError.message.includes('already been registered')) {
                // Get existing user
                const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
                const existingUser = existingUsers?.users?.find(u => u.email === email);

                if (existingUser) {
                    // Update profile for existing user
                    await supabaseAdmin.from('user_profiles').upsert({
                        id: existingUser.id,
                        username: name,
                        email: email,
                        role: role,
                        user_type: user_type || role,
                        site_id: site_id || null,
                        customer_id: customer_id || null,
                        license_id: license_id || null,
                        is_active: true
                    }, { onConflict: 'id' });

                    return res.status(200).json({
                        success: true,
                        userId: existingUser.id,
                        message: 'User already existed, profile updated'
                    });
                }
            }
            throw authError;
        }

        // Create user profile
        const { error: profileError } = await supabaseAdmin
            .from('user_profiles')
            .upsert({
                id: authData.user.id,
                username: name,
                email: email,
                role: role,
                user_type: user_type || role,
                site_id: site_id || null,
                customer_id: customer_id || null,
                license_id: license_id || null,
                is_active: true
            }, { onConflict: 'id' });

        if (profileError) {
            console.error('Profile creation error:', profileError);
            throw new Error('Failed to create user profile: ' + profileError.message);
        }

        return res.status(200).json({
            success: true,
            userId: authData.user.id,
            message: 'User created successfully'
        });

    } catch (error) {
        console.error('Create user error:', error);
        return res.status(500).json({
            error: error.message || 'Failed to create user'
        });
    }
}
