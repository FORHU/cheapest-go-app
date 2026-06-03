const fs = require('fs');
const path = require('path');

// Load environment variables from .env
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
        let val = match[2] || '';
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        env[match[1]] = val;
    }
});

const functionsSecret = env.FUNCTIONS_SECRET || env.INTERNAL_SECRET || '';

async function testSearch(cityName) {
    console.log(`\n--- Testing /api/fn/travelgatex-search for "${cityName}" ---`);
    try {
        const res = await fetch('http://localhost:3000/api/fn/travelgatex-search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${functionsSecret}`,
            },
            body: JSON.stringify({
                checkin: '2026-06-04',
                checkout: '2026-06-06',
                adults: 2,
                children: 0,
                currency: 'USD',
                cityName,
            }),
        });
        const json = await res.json();
        console.log(`Response Status: ${res.status}`);
        if (json.error) {
            console.log(`Error: ${json.error}`);
        } else {
            console.log(`Total Hotels Found: ${json.totalCount}`);
            if (json.data && json.data.length > 0) {
                console.log('Cheapest Hotel:', JSON.stringify({
                    hotelId: json.data[0].hotelId,
                    name: json.data[0].name,
                    price: json.data[0].price,
                    currency: json.data[0].currency,
                    city: json.data[0].city,
                }, null, 2));
            }
        }
    } catch (err) {
        console.error('Fetch error:', err.message);
    }
}

async function run() {
    await testSearch('Jeju-si');
    await testSearch('Seoul');
    await testSearch('Bangkok');
}

run();
