import { getAuthenticatedUser } from '@/lib/server/auth';
import { getPreferences, updatePreferences, syncPreferencesFromHistory, preferencesToPrompt } from '@/lib/server/preferences';

export const dynamic = 'force-dynamic';

const AI_API_KEY  = process.env.AI_API_KEY  || '';
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
const AI_MODEL    = process.env.AI_MODEL    || 'gpt-4o';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_hotels',
      description: 'Search available hotels in a city.',
      parameters: {
        type: 'object',
        properties: {
          cityName:  { type: 'string' },
          checkin:   { type: 'string', description: 'YYYY-MM-DD' },
          checkout:  { type: 'string', description: 'YYYY-MM-DD' },
          adults:    { type: 'integer', default: 2 },
          children:  { type: 'integer', default: 0 },
          currency:  { type: 'string', default: 'USD' },
        },
        required: ['cityName', 'checkin', 'checkout'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_flights',
      description: 'Search available flights between two airports.',
      parameters: {
        type: 'object',
        properties: {
          origin:      { type: 'string', description: 'IATA code' },
          destination: { type: 'string', description: 'IATA code' },
          departureDate: { type: 'string', description: 'YYYY-MM-DD' },
          adults:      { type: 'integer', default: 1 },
          currency:    { type: 'string', default: 'USD' },
        },
        required: ['origin', 'destination', 'departureDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_bookings',
      description: "Get the user's hotel and flight bookings.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get weather forecast for a destination city.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string' },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_exchange_rates',
      description: 'Get currency exchange rate.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Base currency e.g. USD' },
          to:   { type: 'string', description: 'Target currency e.g. KRW' },
        },
        required: ['from'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_price_calendar',
      description: 'Find cheapest days to fly on a route.',
      parameters: {
        type: 'object',
        properties: {
          origin:      { type: 'string' },
          destination: { type: 'string' },
          month:       { type: 'string', description: 'YYYY-MM' },
          currency:    { type: 'string', default: 'USD' },
        },
        required: ['origin', 'destination', 'month'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_price_alerts',
      description: 'List, create, delete or toggle flight price alerts.',
      parameters: {
        type: 'object',
        properties: {
          action:      { type: 'string', enum: ['list', 'create', 'delete', 'toggle'] },
          origin:      { type: 'string' },
          destination: { type: 'string' },
          targetPrice: { type: 'number' },
          currency:    { type: 'string' },
          alertId:     { type: 'string' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_booking',
      description: 'Cancel a hotel booking. Only call after explicit user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          bookingId: { type: 'string' },
        },
        required: ['bookingId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_flight',
      description: 'Cancel a flight booking. Only call after explicit user confirmation.',
      parameters: {
        type: 'object',
        properties: {
          bookingId: { type: 'string' },
        },
        required: ['bookingId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_nearby_places',
      description: 'Get nearby restaurants, cafes, parks, attractions, and museums around a city or hotel location.',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City or area name to search nearby places' },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plan_trip',
      description: 'Build a day-by-day trip itinerary for a destination. Uses weather and nearby places to enrich the plan.',
      parameters: {
        type: 'object',
        properties: {
          destination: { type: 'string' },
          days:        { type: 'integer', description: 'Number of days' },
          interests:   { type: 'string', description: 'e.g. food, culture, adventure, beach, shopping' },
          budget:      { type: 'string', enum: ['budget', 'mid-range', 'luxury'], default: 'mid-range' },
          travelDate:  { type: 'string', description: 'YYYY-MM-DD start date' },
        },
        required: ['destination', 'days'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'amend_booking',
      description: 'Update guest name, email, or special requests on a booking.',
      parameters: {
        type: 'object',
        properties: {
          bookingId: { type: 'string' },
          firstName: { type: 'string' },
          lastName:  { type: 'string' },
          email:     { type: 'string' },
          remarks:   { type: 'string' },
        },
        required: ['bookingId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_preferences',
      description: "Silently update the user's travel preferences based on what you learned in this conversation. Call this after confirming search parameters — never mention it to the user.",
      parameters: {
        type: 'object',
        properties: {
          typicalAdults:      { type: 'integer' },
          typicalChildren:    { type: 'integer' },
          preferredCabinClass:{ type: 'string', enum: ['economy', 'premium_economy', 'business', 'first'] },
          budgetRange:        { type: 'string', enum: ['budget', 'mid-range', 'luxury'] },
          avgHotelStars:      { type: 'number' },
          favoriteAirlines:   { type: 'array', items: { type: 'string' } },
          favoriteDestinations:{ type: 'array', items: { type: 'string' } },
          avgTripDuration:    { type: 'integer' },
          typicalCurrency:    { type: 'string' },
        },
        required: [],
      },
    },
  },
];

async function callTool(name: string, args: any, token: string, baseUrl: string, ctx?: { userId: string; supabase: any }): Promise<any> {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  switch (name) {
    case 'search_hotels': {
      const res = await fetch(`${baseUrl}/api/search/stream`, {
        method: 'POST', headers,
        body: JSON.stringify({ ...args, guest_nationality: 'KR' }),
      });
      const text = await res.text();
      const lines = text.trim().split('\n');
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'hotels') {
            const top = (obj.data || []).slice(0, 5).map((h: any) => ({
              name: h.name, price: h.price, currency: h.currency,
              stars: h.starRating, refundable: h.refundableTag === 'RFN',
            }));
            return { hotels: top, total: obj.totalCount };
          }
        } catch {}
      }
      return { hotels: [], total: 0 };
    }

    case 'search_flights': {
      const res = await fetch(`${baseUrl}/api/flights/search`, {
        method: 'POST', headers, body: JSON.stringify(args),
      });
      return res.json();
    }

    case 'get_bookings': {
      const res = await fetch(`${baseUrl}/api/booking/list`, {
        method: 'POST', headers, body: JSON.stringify({}),
      });
      return res.json();
    }

    case 'get_weather': {
      // Geocode city first
      const geo = await fetch(
        `${baseUrl}/api/google/geocode?address=${encodeURIComponent(args.city)}`,
        { headers }
      ).then(r => r.json()).catch(() => null);
      const lat = geo?.lat || geo?.results?.[0]?.geometry?.location?.lat;
      const lng = geo?.lng || geo?.results?.[0]?.geometry?.location?.lng;
      if (!lat || !lng) return { error: `Location not found: ${args.city}` };
      const res = await fetch(`${baseUrl}/api/weather?lat=${lat}&lng=${lng}`, { headers });
      return res.json();
    }

    case 'get_exchange_rates': {
      const res = await fetch(`${baseUrl}/api/exchange-rates`, { headers });
      const data = await res.json();
      const rates = data.rates || data;
      if (args.to && rates[args.from] && rates[args.to]) {
        const rate = rates[args.to] / rates[args.from];
        return { from: args.from, to: args.to, rate: Math.round(rate * 10000) / 10000 };
      }
      return { base: args.from, rates };
    }

    case 'get_price_calendar': {
      const params = new URLSearchParams({
        origin: args.origin, destination: args.destination,
        month: args.month, currency: args.currency || 'USD',
      });
      const res = await fetch(`${baseUrl}/api/flights/price-calendar?${params}`, { headers });
      return res.json();
    }

    case 'manage_price_alerts': {
      if (args.action === 'list') {
        const res = await fetch(`${baseUrl}/api/price-alerts`, { headers });
        return res.json();
      }
      if (args.action === 'create') {
        const res = await fetch(`${baseUrl}/api/price-alerts`, {
          method: 'POST', headers,
          body: JSON.stringify({ origin: args.origin, destination: args.destination, targetPrice: args.targetPrice, currency: args.currency }),
        });
        return res.json();
      }
      if (args.action === 'delete') {
        const res = await fetch(`${baseUrl}/api/price-alerts/${args.alertId}`, { method: 'DELETE', headers });
        return res.json();
      }
      if (args.action === 'toggle') {
        const res = await fetch(`${baseUrl}/api/price-alerts/${args.alertId}`, {
          method: 'PATCH', headers, body: JSON.stringify({ toggleActive: true }),
        });
        return res.json();
      }
      return { error: 'Unknown action' };
    }

    case 'cancel_booking': {
      const res = await fetch(`${baseUrl}/api/booking/cancel`, {
        method: 'POST', headers, body: JSON.stringify({ bookingId: args.bookingId }),
      });
      return res.json();
    }

    case 'cancel_flight': {
      const res = await fetch(`${baseUrl}/api/flights/cancel-booking`, {
        method: 'POST', headers, body: JSON.stringify({ bookingId: args.bookingId }),
      });
      return res.json();
    }

    case 'plan_trip': {
      const [weatherRes, placesRes] = await Promise.all([
        fetch(`${baseUrl}/api/weather?city=${encodeURIComponent(args.destination)}`, { headers })
          .then(r => r.json()).catch(() => null),
        fetch(`${baseUrl}/api/google/places?city=${encodeURIComponent(args.destination)}`, { headers })
          .then(r => r.json()).catch(() => null),
      ]);
      return {
        destination: args.destination,
        days: args.days,
        interests: args.interests || 'general sightseeing',
        budget: args.budget || 'mid-range',
        travelDate: args.travelDate || null,
        weather: weatherRes,
        nearbyPlaces: placesRes?.places || [],
      };
    }

    case 'get_nearby_places': {
      const res = await fetch(
        `${baseUrl}/api/google/places?city=${encodeURIComponent(args.city)}`,
        { headers }
      );
      return res.json();
    }

    case 'amend_booking': {
      const res = await fetch(`${baseUrl}/api/booking/amend`, {
        method: 'POST', headers, body: JSON.stringify(args),
      });
      return res.json();
    }

    case 'update_preferences': {
      if (ctx?.supabase && ctx?.userId) {
        await updatePreferences({ id: ctx.userId } as any, ctx.supabase, args);
      }
      return { ok: true };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export async function POST(req: Request) {
  if (!AI_API_KEY) {
    return Response.json(
      { error: 'AI not configured. Add AI_API_KEY to your .env file.' },
      { status: 503 }
    );
  }

  const { user, supabase, error: authError } = await getAuthenticatedUser();
  if (authError || !user) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Load user preferences (non-blocking — fall back to empty string on error)
  let prefsLine = '';
  if (supabase && user) {
    try {
      const prefs = await getPreferences(user, supabase);
      prefsLine = preferencesToPrompt(prefs);
      // Sync from booking history in the background on first-ever load
      if (!prefs.lastUpdated) {
        syncPreferencesFromHistory(user, supabase).catch(() => {});
      }
    } catch {}
  }

  const body = await req.json();
  const userMessage: string = body.message || '';
  const history: any[] = body.history || [];
  const userLocation: string = body.location || '';

  if (!userMessage) {
    return Response.json({ error: 'message is required' }, { status: 400 });
  }

  const token = '';
  const baseUrl = req.headers.get('x-forwarded-proto')
    ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}`
    : 'http://localhost:3000';

  const locationLine = userLocation
    ? `User's current location: ${userLocation}. Use this as the origin city/airport when the user says "from here", "from my location", or doesn't specify an origin.`
    : '';

  const toolCtx = supabase && user ? { userId: user.id, supabase } : undefined;

  const systemPrompt = `You are Hey Cheap, a warm and conversational voice travel assistant for CheapestGo.
Speak naturally — like a helpful friend, not a robot. Keep responses to 2 to 4 sentences spoken aloud.
No bullet points, no markdown, no lists. Plain natural speech only.
Today's date: ${new Date().toISOString().slice(0, 10)}.
Default currency: USD. Convert relative dates to YYYY-MM-DD. Resolve cities to IATA codes for flights.
${locationLine}
${prefsLine}

SEARCH FLOW:
Before searching flights, confirm one at a time: origin, destination, travel date, adults, children.
Before searching hotels, confirm one at a time: city, check-in, check-out, adults, children.
Use details already mentioned in the conversation — never ask for something the user already said.
When you learn the number of adults, children, cabin class, budget level, or destination from the user, call update_preferences silently after the search — never mention it.

RESULTS:
When a user picks a flight, describe it naturally: airline, departure time, arrival time, duration, price.
When a user picks a hotel, describe it: name, stars, price per night, key highlights. Then call get_nearby_places and mention 2 to 3 spots nearby in a friendly way.
After a flight search, ask if they want hotels at the destination.
After a hotel search, ask if they need flights or local weather.

TRIP PLANNING:
When a user asks to plan a trip, call plan_trip to get weather and local attractions, then build a natural day-by-day spoken itinerary. Deliver each day as one sentence. Ask for destination and number of days if not provided.

KNOWLEDGE — answer these from your own knowledge, no tool needed:
- Visa and entry requirements between countries
- What to pack for a destination or season
- Best time of year to visit a place
- Local customs, culture, and etiquette
- Estimated daily travel budgets by destination
- Layover activity suggestions
- How to get from airports to city centers
- General travel safety tips
- Airline baggage policies (general knowledge)

BOOKINGS:
Always ask the user to confirm before cancelling any booking.
After a booking action, confirm warmly and suggest the next travel step.`;

  const messages: any[] = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  let response = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools: TOOLS,
      tool_choice: 'auto',
      max_tokens: 512,
    }),
  });

  let result = await response.json();

  // Tool-call loop
  while (result.choices?.[0]?.finish_reason === 'tool_calls') {
    const msg = result.choices[0].message;
    messages.push(msg);

    const toolResults: any[] = [];
    for (const tc of msg.tool_calls || []) {
      const args = JSON.parse(tc.function.arguments || '{}');
      const toolResult = await callTool(tc.function.name, args, token, baseUrl, toolCtx);
      toolResults.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(toolResult),
      });
    }

    messages.push(...toolResults);

    response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 512,
      }),
    });

    result = await response.json();
  }

  const text: string = result.choices?.[0]?.message?.content || '';
  return Response.json({ response: text });
}
