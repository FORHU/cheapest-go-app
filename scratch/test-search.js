
const SUPABASE_URL = 'https://bjhokdrgjyqhhccpuoaa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqaG9rZHJnanlxaGhjY3B1b2FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTAyODgsImV4cCI6MjA4NDQ2NjI4OH0.RpH1xg2izTtc89I9FRLwzh_IrUJ5IfZBF4VDA-AKjDw';

async function testSearch() {
    const body = {
        cityName: "Baguio",
        countryCode: "PH",
        checkin: "2026-05-16",
        checkout: "2026-05-18",
        adults: 2,
        rooms: 1,
        currency: "USD"
    };

    console.log('Testing search with body:', JSON.stringify(body));

    try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/liteapi-search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify(body),
        });

        console.log('Status:', response.status);
        const data = await response.json();
        console.log('Data count:', data.data?.length);
        if (data.error) {
            console.error('Error from function:', data.error);
            console.error('Details:', data.details);
        }
    } catch (err) {
        console.error('Fetch failed:', err);
    }
}

testSearch();
