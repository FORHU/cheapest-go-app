import { createAdminClient } from './src/utils/supabase/admin';

async function run() {
    const supabase = createAdminClient();
    const res = await supabase.from('flight_bookings').select('id, session_id, booking_sessions(contact)').limit(1);
    console.log(JSON.stringify(res, null, 2));
}

run();
