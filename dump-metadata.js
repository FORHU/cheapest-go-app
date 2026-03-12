import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: flightData, error: flightError } = await supabase
    .from('flight_bookings')
    .select('id, provider, pnr, status')
    .limit(3);

  console.log("FLIGHTS:");
  console.log(JSON.stringify(flightData, null, 2));

  const { data: hotelData, error: hotelError } = await supabase
    .from('bookings')
    .select('id, holder_first_name, holder_email, status')
    .limit(3);

  console.log("HOTELS:");
  console.log(JSON.stringify(hotelData, null, 2));
}

main();
