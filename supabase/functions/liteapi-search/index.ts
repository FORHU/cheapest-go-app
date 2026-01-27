import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Declare Deno to avoid lint errors in this environment
declare const Deno: any;

interface HotelDetails {
  id: string | number;
  name: string;
  hotel_star_rating?: number;
  star_rating?: number;
  main_photo?: string;
  address?: string;
  [key: string]: any;
}

interface Hotel {
  hotelId: string;
  details?: HotelDetails;
  name?: string;
  starRating?: number;
  thumbnailUrl?: string;
  address?: string;
  location?: string;
  description?: string;
  reviewCount?: number;
  reviewRating?: number;
  [key: string]: any;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const LITEAPI_KEY = Deno.env.get('LITEAPI_KEY');

  try {
    const rawData = await req.text();
    const body = JSON.parse(rawData || "{}");

    // Mapping inputs
    const checkin = body.checkin || body.startDate;
    const checkout = body.checkout || body.endDate;
    const countryCode = body.countryCode || "PH";
    const currency = body.currency || "PHP";
    const guestNationality = body.guestNationality || countryCode;
    const placeId = body.placeId;

    // ... probe code ...

    // 1. Fetch Rates
    console.log("Fetching rates...");

    // Construct location parameters:
    // Priority: hotelIds > placeId > (cityName + countryCode)
    let locationParams = {};
    if (body.hotelIds) {
      locationParams = { hotelIds: body.hotelIds };
    } else if (placeId) {
      locationParams = { placeId: placeId };
    } else {
      locationParams = { cityName: body.cityName || "Manila", countryCode: countryCode };
    }

    const ratesPayload = JSON.stringify({
      checkin,
      checkout,
      currency,
      guestNationality,
      ...locationParams,
      occupancies: [{ adults: body.adults || 2, children: body.children || [] }],
      timeout: 15
    });

    const ratesResponse = await fetch(`https://api.liteapi.travel/v3.0/hotels/rates`, {
      method: "POST",
      headers: { 'X-API-Key': LITEAPI_KEY, 'Content-Type': 'application/json' },
      body: ratesPayload
    });

    if (!ratesResponse.ok) {
      const errorText = await ratesResponse.text();
      throw new Error(`LiteAPI Rates ${ratesResponse.status}: ${errorText}`);
    }

    const ratesData = await ratesResponse.json() as { data: Hotel[] };
    const hotels = ratesData.data || [];

    if (hotels.length === 0) {
      return new Response(JSON.stringify({ data: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // 2. Extract Hotel IDs (Limit to top 20 to avoid hitting URL length limits or timeouts)
    const hotelIds = hotels.slice(0, 20).map((h) => h.hotelId);
    console.log(`Fetching details for ${hotelIds.length} hotels...`);

    // 3. Fetch Hotel Details
    const detailsResponse = await fetch(`https://api.liteapi.travel/v3.0/data/hotels?hotelIds=${hotelIds.join(',')}`, {
      method: "GET",
      headers: { 'X-API-Key': LITEAPI_KEY, 'Content-Type': 'application/json' }
    });

    if (!detailsResponse.ok) {
      // If details fail, return rates only but warn
      console.error(`LiteAPI Details Failed ${detailsResponse.status}`);
      // We continue with rates only, properties will just lack metadata
    } else {
      const detailsData = await detailsResponse.json() as { data: HotelDetails[] };
      // Normalize IDs to string vs number mismatch
      const detailsMap = new Map((detailsData.data || []).map((d) => [String(d.id), d]));

      // 4. Merge Details into Hotels
      hotels.forEach((hotel: Hotel) => {
        const detail = detailsMap.get(String(hotel.hotelId));
        if (detail) {
          hotel.details = detail; // Attach the full detail object
          // Overwrite name with official detail name
          hotel.name = detail.name;
          hotel.starRating = detail.hotel_star_rating || detail.star_rating; // Handle API variations
          hotel.thumbnailUrl = detail.main_photo;
          hotel.address = detail.address;
          hotel.location = detail.address; // Map to location

          // Map Description
          hotel.description = detail.description || detail.hotel_description || detail.short_description || "";

          // Map Reviews
          hotel.reviewCount = detail.review_count || detail.cnt_reviews || detail.number_of_reviews || 0;
          hotel.reviewRating = detail.review_score || detail.rating_average || 0;
        }
      });
    }

    return new Response(JSON.stringify({
      data: hotels,
      debugInfo: {
        receivedBody: body,
        sentPayload: JSON.parse(ratesPayload),
        firstHotelDetails: hotels.length > 0 && hotels[0].details ? hotels[0].details : "No details attached"
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error: any) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({
      error: "Search Failed",
      details: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});
