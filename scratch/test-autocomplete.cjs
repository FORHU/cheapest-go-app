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

async function testAutocomplete(keyword) {
    console.log(`\n--- Testing /api/fn/travelgatex-destinations for "${keyword}" ---`);
    try {
        const res = await fetch('http://localhost:3000/api/fn/travelgatex-destinations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${functionsSecret}`,
            },
            body: JSON.stringify({ keyword }),
        });
        const json = await res.json();
        console.log(`Response Status: ${res.status}`);
        if (json.error) {
            console.log(`Error: ${json.error}`);
        } else {
            console.log(`Total Destinations Returned: ${json.data?.length || 0}`);
            console.log('Results:', JSON.stringify(json.data, null, 2));
        }
    } catch (err) {
        console.error('Fetch error:', err.message);
    }
}

async function run() {
    await testAutocomplete('Jeju');
    await testAutocomplete('Seoul');
    await testAutocomplete('Bangkok');
}

run();
