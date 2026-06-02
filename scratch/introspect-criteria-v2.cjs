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
const endpoint = env.TRAVELGATEX_ENDPOINT_URL || 'https://api.travelgate.com';

const query = `
query IntrospectCriteriaV2 {
  __type(name: "HotelXDestinationSearcherInput") {
    name
    inputFields {
      name
      type {
        name
        kind
        ofType {
          name
          kind
          ofType {
            name
            kind
          }
        }
      }
    }
  }
}`;

async function run() {
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Apikey ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
        });
        const json = await res.json();
        console.log('HotelXDestinationSearcherInput fields:', JSON.stringify(json.data?.__type, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    }
}

run();
