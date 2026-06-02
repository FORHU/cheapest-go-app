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

const destQuery = `
query TgxResolveDestination($access: ID!, $text: String!) {
  hotelX {
    destinationSearcher(criteria: { access: $access, text: $text, maxSize: 5 }) {
      ... on DestinationData {
        code
        type
        texts { text language }
      }
    }
  }
}`;

const searchQuery = `
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

async function getDestinations(text) {
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Apikey ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: destQuery,
                variables: { access: accessCode, text }
            }),
        });
        const json = await res.json();
        return json.data?.hotelX?.destinationSearcher || [];
    } catch (err) {
        console.error('Error resolving destination:', err.message);
        return [];
    }
}

async function searchWithDest(code) {
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Apikey ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: searchQuery,
                variables: {
                    criteria: {
                        checkIn: '2026-06-04',
                        checkOut: '2026-06-06',
                        occupancies: [{ paxes: [{ age: 30 }, { age: 30 }] }],
                        nationality: 'KR',
                        currency: 'KRW',
                        destinations: [code]
                    },
                    settings: {
                        context: 'OTV',
                        client: 'forhuinc',
                        suppliers: [{ code: 'OTV', accesses: [{ accessId: accessCode }] }],
                        businessRules: {
                            optionsQuota: 200,
                            businessRulesType: "CHEAPER_AMOUNT"
                        },
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
        const options = json.data?.hotelX?.search?.options || [];
        const errors = json.data?.hotelX?.search?.errors || [];
        console.log(`Results for destination ${code}: optionsCount=${options.length}, errorsCount=${errors.length}`);
        if (errors.length) {
            console.log('Errors:', JSON.stringify(errors, null, 2));
        }
        if (options.length > 0) {
            console.log('First 3 options:', JSON.stringify(options.slice(0, 3), null, 2));
        }
    } catch (err) {
        console.error('Search error for destination', code, ':', err.message);
    }
}

async function run() {
    console.log('Resolving "Bangkok"...');
    const bkkDests = await getDestinations('Bangkok');
    console.log('Resolved destinations for "Bangkok":', JSON.stringify(bkkDests, null, 2));
    
    for (const d of bkkDests) {
        if (d.code) {
            console.log(`\nTesting search for code ${d.code} (${d.type} - ${d.texts?.[0]?.text || ''})`);
            await searchWithDest(d.code);
        }
    }
}

run();
