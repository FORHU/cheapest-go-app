/**
 * One-time script to promote a user to admin.
 *
 * Usage:
 *   npx tsx scripts/promote-admin.ts your-email@example.com
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];

if (!email) {
    console.error('Usage: npx tsx scripts/promote-admin.ts <email>');
    process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function promote() {
    // Find the user by email
    const { data: profile, error: findError } = await supabase
        .from('profiles')
        .select('id, email, role')
        .eq('email', email)
        .single();

    if (findError || !profile) {
        console.error(`User not found with email: ${email}`);
        process.exit(1);
    }

    if (profile.role === 'admin') {
        console.log(`${email} is already an admin.`);
        process.exit(0);
    }

    // Update profiles table
    const { error: profileError } = await supabase
        .from('profiles')
        .update({ role: 'admin' })
        .eq('id', profile.id);

    if (profileError) {
        console.error('Failed to update profile:', profileError.message);
        process.exit(1);
    }

    // Sync user_metadata
    const { error: metaError } = await supabase.auth.admin.updateUserById(
        profile.id,
        { user_metadata: { role: 'admin' } }
    );

    if (metaError) {
        console.warn('Profile updated but metadata sync failed:', metaError.message);
    }

    console.log(`Done! ${email} is now an admin.`);
}

promote();
