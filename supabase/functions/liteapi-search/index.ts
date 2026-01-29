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
    console.log("===== INCOMING REQUEST =====");
    console.log("Raw request body:", rawData);
    const body = JSON.parse(rawData || "{}");
    console.log("Parsed body:", JSON.stringify(body));

    // Mapping inputs
    const checkin = body.checkin || body.startDate;
    const checkout = body.checkout || body.endDate;
    const countryCode = body.countryCode || "PH";
    const currency = body.currency || "PHP";
    const guestNationality = body.guestNationality || countryCode;
    const placeId = body.placeId;

    console.log("Extracted values - checkin:", checkin, "checkout:", checkout, "placeId:", placeId, "countryCode:", countryCode, "cityName:", body.cityName);

    // ... probe code ...

    // 1. Fetch Rates
    console.log("Fetching rates...");

    // Construct location parameters:
    // Priority: hotelIds > cityName + countryCode > placeId
    // NOTE: cityName + countryCode provides most accurate city-specific results
    // placeId is for Google Place IDs which may not match LiteAPI's place IDs
    let locationParams = {};

    // Normalize city name for better LiteAPI matching
    // LiteAPI requires exact cityName match (case-sensitive)
    let normalizedCityName = body.cityName || "";
    if (normalizedCityName) {
      // Remove "City" suffix for cleaner matching (e.g., "Baguio City" -> "Baguio")
      normalizedCityName = normalizedCityName.replace(/\s+City$/i, '').trim();
    }

    if (body.hotelIds) {
      locationParams = { hotelIds: body.hotelIds };
      console.log("Using hotelIds:", body.hotelIds);
    } else if (normalizedCityName && countryCode) {
      // PRIORITIZE cityName + countryCode for accurate city-specific searches
      // This ensures we only get hotels in the exact city selected
      locationParams = { cityName: normalizedCityName, countryCode: countryCode };
      console.log("Using cityName:", normalizedCityName, "(original:", body.cityName, ") countryCode:", countryCode);
    } else if (placeId) {
      // Fallback to placeId if cityName not available (should rarely happen)
      // Note: placeId from autocomplete might not be Google Place ID
      locationParams = { placeId: placeId };
      console.log("Using placeId:", placeId);
    } else {
      // Last resort fallback
      locationParams = { cityName: "Manila", countryCode: "PH" };
      console.log("Using default cityName: Manila, countryCode: PH");
    }

    console.log("Full location params:", JSON.stringify(locationParams));

    const ratesPayload = JSON.stringify({
      checkin,
      checkout,
      currency,
      guestNationality,
      ...locationParams,
      occupancies: [{ adults: body.adults || 2, children: body.children || [] }],
      roomMapping: true,  // Enable room photos and details
      includeHotelData: true,  // Include hotel data with photos
      timeout: 15
    });

    console.log("Rates payload:", ratesPayload);

    const ratesResponse = await fetch(`https://api.liteapi.travel/v3.0/hotels/rates`, {
      method: "POST",
      headers: { 'X-API-Key': LITEAPI_KEY, 'Content-Type': 'application/json' },
      body: ratesPayload
    });

    console.log("LiteAPI Response status:", ratesResponse.status);

    if (!ratesResponse.ok) {
      const errorText = await ratesResponse.text();
      console.error("LiteAPI Error Response:", errorText);
      throw new Error(`LiteAPI Rates ${ratesResponse.status}: ${errorText}`);
    }

    let ratesData = await ratesResponse.json() as { data: Hotel[], rooms?: any[] };
    console.log("LiteAPI Response data count:", ratesData.data?.length || 0);
    console.log("LiteAPI Full Response:", JSON.stringify(ratesData).substring(0, 500));

    let hotels = ratesData.data || [];

    if (hotels.length === 0) {
      console.log("No hotels found - returning empty result");
      return new Response(JSON.stringify({ data: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // 2. Extract Hotel IDs (Limit to top 20 to avoid hitting URL length limits or timeouts)
    const hotelIds = hotels.slice(0, 20).map((h) => h.hotelId);

    // 3. Fetch Hotel Details
    // Use singular /data/hotel/{id} endpoint for single hotel (returns full hotelImages array)
    // Use plural /data/hotels endpoint for multiple hotels (only returns main_photo)
    let detailsData: { data: HotelDetails[] } = { data: [] };

    if (hotelIds.length === 1) {
      // Single hotel - use /data/hotel/{id} for full details including hotelImages
      console.log(`Fetching detailed info for single hotel: ${hotelIds[0]}`);
      const detailsResponse = await fetch(`https://api.liteapi.travel/v3.0/data/hotel?hotelId=${hotelIds[0]}`, {
        method: "GET",
        headers: { 'X-API-Key': LITEAPI_KEY, 'Content-Type': 'application/json' }
      });

      if (detailsResponse.ok) {
        const singleDetail = await detailsResponse.json();
        // The singular endpoint returns { data: { ...hotelDetails } } - wrap in array
        detailsData = { data: singleDetail.data ? [singleDetail.data] : [] };
      } else {
      }
    } else {
      // Multiple hotels - use /data/hotels for batch fetch
      // We need to fetch details for ALL hotels, but the API URL has length limits
      // Chunk the IDs into batches of 50
      const CHUNK_SIZE = 50;
      const allHotelIds = hotels.map((h) => h.hotelId);
      const chunks = [];

      for (let i = 0; i < allHotelIds.length; i += CHUNK_SIZE) {
        chunks.push(allHotelIds.slice(i, i + CHUNK_SIZE));
      }

      console.log(`Fetching batch details for ${allHotelIds.length} hotels in ${chunks.length} chunks`);

      // Fetch all chunks in parallel
      const chunkPromises = chunks.map(async (chunkIds) => {
        const idsStr = chunkIds.join(',');
        try {
          const detailsResponse = await fetch(`https://api.liteapi.travel/v3.0/data/hotels?hotelIds=${idsStr}`, {
            method: "GET",
            headers: { 'X-API-Key': LITEAPI_KEY, 'Content-Type': 'application/json' }
          });

          if (detailsResponse.ok) {
            const json = await detailsResponse.json();
            return json.data || [];
          } else {
            const errText = await detailsResponse.text();
            console.error(`Batch details chunk fetch failed: ${detailsResponse.status} ${errText}`);
            return [];
          }
        } catch (e) {
          console.error("Batch details chunk error:", e);
          return [];
        }
      });

      const allDetailsArrays = await Promise.all(chunkPromises);
      // Flatten arrays
      const allDetails = allDetailsArrays.flat();
      console.log(`Total details fetched: ${allDetails.length}`);

      detailsData = { data: allDetails };
    }

    // Process the details data (whether from single or batch fetch)
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

        // Map Description - Only overwrite if detail has it
        if (detail.description || detail.hotel_description || detail.short_description) {
          hotel.description = detail.description || detail.hotel_description || detail.short_description || "";
        }

        // Map Reviews
        hotel.reviewCount = detail.review_count || detail.cnt_reviews || detail.number_of_reviews || 0;
        hotel.reviewRating = detail.review_score || detail.rating_average || 0;

        // Map Images - LiteAPI /data/hotel returns hotelImages array with url/urlHd
        const hotelImages = detail.hotelImages || detail.images || detail.hotel_photos || [];
        if (Array.isArray(hotelImages) && hotelImages.length > 0) {
          // Extract URLs, preferring HD versions
          hotel.images = hotelImages.map((img: any) => img.urlHd || img.url || img).filter(Boolean);
        } else if (detail.main_photo) {
          // Fallback to main_photo if no images array
          hotel.images = [detail.main_photo];
        }

        // Extract rooms from hotel details for room photo mapping
        // The /data/hotel endpoint returns rooms array with photos
        const detailRooms = detail.rooms || [];
        if (Array.isArray(detailRooms) && detailRooms.length > 0) {
          hotel.detailRooms = detailRooms;  // Store for mapping later
        }

        // Map Check-in/Check-out times
        if (detail.checkinCheckoutTimes) {
          hotel.checkInTime = detail.checkinCheckoutTimes.checkin || detail.checkinCheckoutTimes.checkinStart;
          hotel.checkOutTime = detail.checkinCheckoutTimes.checkout;
        }

        // Map Hotel Facilities (array of strings)
        hotel.hotelFacilities = detail.hotelFacilities || [];

        // Map Coordinates
        hotel.latitude = detail.latitude;
        hotel.longitude = detail.longitude;

        // Map City/Country
        hotel.city = detail.city;
        hotel.country = detail.country;
        hotel.countryCode = detail.countryCode;
      }
    });

    return new Response(JSON.stringify({
      data: hotels
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
