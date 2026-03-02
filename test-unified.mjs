import fs from 'fs';

async function run() {
    console.log("Testing live unified-flight-search...");
    const liveUrl = 'https://bjhokdrgjyqhhccpuoaa.supabase.co/functions/v1/unified-flight-search';

    const reqBody = {
        origin: 'MNL',
        destination: 'ICN',
        departureDate: '2026-04-15',
        adults: 1,
        cabinClass: 'economy'
    };

    try {
        const res = await fetch(liveUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqaG9rZHJnanlxaGhjY3B1b2FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTAyODgsImV4cCI6MjA4NDQ2NjI4OH0.RpH1xg2izTtc89I9FRLwzh_IrUJ5IfZBF4VDA-AKjDw',
                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqaG9rZHJnanlxaGhjY3B1b2FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4OTAyODgsImV4cCI6MjA4NDQ2NjI4OH0.RpH1xg2izTtc89I9FRLwzh_IrUJ5IfZBF4VDA-AKjDw'
            },
            body: JSON.stringify(reqBody)
        });

        const text = await res.text();
        fs.writeFileSync('results.json', text);
        console.log("Status:", res.status);
        console.log("Wrote full JSON response to results.json");
    } catch (err) {
        console.error(err);
    }
}
run();
