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
query IntrospectDestSearcher($access: ID!, $text: String!) {
  hotelX {
    destinationSearcher(criteria: { access: $access, text: $text, maxSize: 10 }) {
      __typename
      ... on DestinationData {
        code
        type
        texts { text language }
      }
    }
  }
}`;

async function test(text) {
    console.log(`\n--- Querying __typename for "${text}" ---`);
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Apikey ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query,
                variables: { access: accessCode, text }
            }),
        });
        const json = await res.json();
        const list = json.data?.hotelX?.destinationSearcher || [];
        console.log(`Total results: ${list.length}`);
        list.forEach((item, idx) => {
            console.log(`[${idx}] __typename: ${item.__typename}, code: ${item.code || 'undefined'}, type: ${item.type || 'undefined'}, name: ${item.texts?.[0]?.text || 'undefined'}`);
        });
    } catch (err) {
        console.error('Error:', err.message);
    }
}

async function run() {
    await test("Jeju-si");
    await test("Jeju");
    await test("Seoul");
    await test("Bangkok");
}

run();
