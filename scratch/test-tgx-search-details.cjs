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

const apiKey = env.TRAVELGATEX_API_KEY || env.TRAVELGATE_API_KEY;
const accessCode = env.TRAVELGATEX_CODE || env.TRAVELGATE_CODE || '38327';
const endpoint = env.TRAVELGATEX_ENDPOINT_URL || 'https://api.travelgate.com';

const query = `
query TgxSearch($criteria: HotelCriteriaSearchInput!, $settings: HotelSettingsInput!) {
  hotelX {
    search(criteria: $criteria, settings: $settings) {
      options {
        id
        hotelCode
        boardCode
        paymentType
        status
        price { currency net gross }
        token
      }
      errors { code type description }
    }
  }
}`;

async function run() {
    console.log('--- Testing Search with Resolved Code "850" (Jeju) and Plugin ---');
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Apikey ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query,
                variables: {
                    criteria: {
                        checkIn: '2026-06-04',
                        checkOut: '2026-06-06',
                        occupancies: [{ paxes: [{ age: 30 }, { age: 30 }] }],
                        nationality: 'KR',
                        currency: 'KRW',
                        destinations: ['850']
                    },
                    settings: {
                        context: 'OTV',
                        client: 'forhuinc',
                        suppliers: [{ code: 'OTV', accesses: [{ accessId: accessCode }] }],
                        plugins: [
                            {
                                step: "REQUEST",
                                pluginsType: [
                                    {
                                        type: "PRE_STEP",
                                        name: "search_by_destination",
                                        enable: true,
                                        parameters: [
                                            {
                                                key: "accessID",
                                                value: accessCode
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                }
            }),
        });
        const json = await res.json();
        console.log('Raw Search Response:', JSON.stringify(json, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    }
}

run();
