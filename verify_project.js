import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error('Missing Supabase URL or Service Key in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

async function verify() {
    console.log(`Checking project: ${supabaseUrl}`);

    const { count, error } = await supabase
        .from('unified_bookings')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('Error querying unified_bookings:', error.message);
    } else {
        console.log(`Total bookings in unified_bookings: ${count}`);
    }

    const { data: profiles, error: pError } = await supabase
        .from('profiles')
        .select('email, role')
        .limit(5);

    if (pError) {
        console.error('Error querying profiles:', pError.message);
    } else {
        console.log('Sample profiles:', profiles);
    }
}

verify();
