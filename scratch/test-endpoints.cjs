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

const functionsSecret = env.FUNCTIONS_SECRET || env.INTERNAL_SECRET;
const siteUrl = env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

async function testAutocomplete() {
    console.log('\n--- Testing Autocomplete ("/api/fn/travelgatex-destinations") ---');
    try {
        const res = await fetch(`${siteUrl}/api/fn/travelgatex-destinations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${functionsSecret}`
            },
            body: JSON.stringify({ keyword: 'Jeju' }),
        });
        const json = await res.json();
        console.log('Autocomplete status:', res.status);
        console.log('Autocomplete results count:', json.data?.length || 0);
        if (json.data && json.data.length > 0) {
            console.log('Sample result:', json.data[0]);
        } else {
            console.log('No results or error:', json);
        }
    } catch (err) {
        console.error('Autocomplete request failed:', err.message);
    }
}

async function testSearch() {
    console.log('\n--- Testing Search ("/api/fn/travelgatex-search" with "Jeju-si") ---');
    try {
        const res = await fetch(`${siteUrl}/api/fn/travelgatex-search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${functionsSecret}`
            },
            body: JSON.stringify({
                checkin: '2026-06-04',
                checkout: '2026-06-06',
                cityName: 'Jeju-si',
                countryCode: 'KR',
                adults: 2,
                children: 0,
                currency: 'KRW'
            }),
        });
        const json = await res.json();
        console.log('Search status:', res.status);
        console.log('Search results count:', json.data?.length || 0);
        if (json.data && json.data.length > 0) {
            console.log('Cheapest stay found:', json.data[0].name, 'Price:', json.data[0].price, json.data[0].currency);
        } else {
            console.log('No results or error:', json);
        }
    } catch (err) {
        console.error('Search request failed:', err.message);
    }
}

async function run() {
    await testAutocomplete();
    await testSearch();
}

run();
