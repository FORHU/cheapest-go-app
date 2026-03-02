import { load } from "https://deno.land/std@0.208.0/dotenv/mod.ts";

const env = await load({ envPath: './.env' });
const USERNAME = env["MYSTIFLY_USERNAME"] || Deno.env.get("MYSTIFLY_USERNAME");
const PASSWORD = env["MYSTIFLY_PASSWORD"] || Deno.env.get("MYSTIFLY_PASSWORD");
const ACCOUNT_NUMBER = env["MYSTIFLY_ACCOUNT_NUMBER"] || Deno.env.get("MYSTIFLY_ACCOUNT_NUMBER");
const BASE_URL = env["MYSTIFLY_BASE_URL"] || Deno.env.get("MYSTIFLY_BASE_URL");

console.log("BASE_URL:", BASE_URL);

// 1. Create Session
const sessionRes = await fetch(`${BASE_URL}/api/CreateSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        UserName: USERNAME,
        Password: PASSWORD,
        AccountNumber: ACCOUNT_NUMBER,
    }),
});
const sessionData = await sessionRes.json();
if (!sessionData.Success) throw new Error("Auth failed");
const sessionId = sessionData.Data.SessionId;

console.log("Session ID:", sessionId.substring(0, 8));

// 2. Search V2
const mystiflyBody = {
    OriginDestinationInformations: [
        {
            DepartureDateTime: `2026-03-06T00:00:00`,
            OriginLocationCode: "BLR",
            DestinationLocationCode: "DEL"
        }
    ],
    TravelPreferences: {
        AirTripType: "OneWay",
        CabinPreference: "Y",
        MaxStopsQuantity: 'All',
        PreferenceLevel: 'Preferred',
        Preferences: {
            CabinClassPreference: {
                CabinType: "Y",
                PreferenceLevel: 'Preferred',
            },
        },
        VendorPreferenceCodes: null,
        VendorExcludeCodes: null,
    },
    PassengerTypeQuantities: [
        { Code: 'ADT', Quantity: 1 }
    ],
    PricingSourceType: "All",
    NearByAirports: true,
    Nationality: "IN",
    Target: 'Test',
    ConversationId: '',
    RequestOptions: 'Fifty'
};

const searchRes = await fetch(`${BASE_URL}/api/v2/Search/Flight`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionId}`
    },
    body: JSON.stringify(mystiflyBody),
});

const searchData = await searchRes.json();
console.log("Success:", searchData.Success);
if (!searchData.Success) {
    console.log("MSG:", searchData.Message);
} else {
    // Print the first item structure
    const keys = Object.keys(searchData.Data);
    console.log("Data Keys:", keys);
    if (searchData.Data.FareItineraries && searchData.Data.FareItineraries.length > 0) {
        console.log("Fare Itinerary 0 keys:", Object.keys(searchData.Data.FareItineraries[0]));
        // check if fare families exist
        console.log("Fare Families?", typeof searchData.Data.FareItineraries[0].FareFamilies);
    }

    // Write out the raw response to investigate
    await Deno.writeTextFile("/tmp/mystifly_v2.json", JSON.stringify(searchData, null, 2));
    console.log("Saved response to /tmp/mystifly_v2.json");
}
