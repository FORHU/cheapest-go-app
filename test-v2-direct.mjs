import fs from 'fs';
import https from 'https';

const urlToTest = 'https://restapidemo.myfarebox.com';
const USERNAME = 'Jung_API';
const PASSWORD = 'Welcome@123';
const ACCOUNT_NUMBER = 'MCN006431';

async function run() {
    console.log("Authenticating...");
    const authRes = await fetch(`${urlToTest}/api/CreateSession`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ AccountNumber: ACCOUNT_NUMBER, Password: PASSWORD, Target: "Test", UserName: USERNAME })
    });

    const textStr = await authRes.text();
    const authData = JSON.parse(textStr);
    const sessionId = authData.Data.SessionId;
    console.log("Session:", sessionId);

    const payload = {
        OriginDestinationInformations: [{ DepartureDateTime: '2026-04-15T00:00:00', OriginLocationCode: 'MNL', DestinationLocationCode: 'ICN' }],
        PassengerTypeQuantities: [{ Code: 'ADT', Quantity: 1 }],
        PricingSourceType: 'All',
        Nationalities: ['KR'],
        Nationality: 'KR',
        NearByAirports: true,
        Target: 'Production',
        ConversationId: '',
        TravelPreferences: {
            AirTripType: 'OneWay',
            CabinPreference: 'Y',
            MaxStopsQuantity: 'All',
            PreferenceLevel: 'Preferred',
            Preferences: { CabinClassPreference: { CabinType: 'Y', PreferenceLevel: 'Preferred' } },
            VendorPreferenceCodes: null,
            VendorExcludeCodes: null
        },
        RequestOptions: 'Hundred'
    };

    console.log("Searching V2 MNL->ICN Target=Production...");
    const res = await fetch(`${urlToTest}/api/v2/Search/Flight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionId}` },
        body: JSON.stringify(payload)
    });

    const raw = await res.text();
    try {
        const body = JSON.parse(raw);
        console.log(`Success: ${body.Success}`);
        fs.writeFileSync('v2_debug.json', JSON.stringify(body, null, 2));
        console.log('Saved to v2_debug.json');
    } catch (e) { console.error("Parse err", String(e).substring(0, 200)); }
}
run();
