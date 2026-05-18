import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOOK_MUTATION = `
mutation BookHotel(
  $input: HotelBookInput!
  $settings: HotelSettingsInput!
) {
  hotelX {
    book(input: $input, settings: $settings) {
      booking {
        reference {
          supplier
          client
          hotel
        }
        status
        cancelPolicy {
          refundable
          cancelPenalties {
            deadline
            penaltyType
            currency
            value
          }
        }
        price {
          currency
          binding
          net
          gross
        }
        hotel {
          hotelCode
          hotelName
          boardCode
          rooms {
            occupancyRefId
            code
            description
          }
        }
      }
      errors { code type description }
      warnings { code type description }
    }
  }
}
`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const TRAVELGATEX_API_KEY = Deno.env.get('TRAVELGATEX_API_KEY');
  const TRAVELGATEX_CLIENT = Deno.env.get('TRAVELGATEX_CLIENT') || 'forhuinc';
  const ENDPOINT = 'https://api.travelgate.com';

  try {
    const body = await req.json();
    const { quoteToken, clientReference, holder, rooms } = body;

    if (!quoteToken || !clientReference || !holder) {
      throw new Error('quoteToken, clientReference, and holder are required');
    }

    console.log('[TGX Book] Booking with clientRef:', clientReference);

    const variables = {
      input: {
        clientReference,
        deltaPrice: { amount: 0, percent: 10, applyBoth: false },
        optionRefId: quoteToken,
        language: 'en',
        holder: {
          name: holder.firstName,
          surname: holder.lastName,
          contactInfo: {
            email: holder.email,
          },
        },
        rooms: rooms || [],
      },
      settings: {
        client: TRAVELGATEX_CLIENT,
        context: 'OTV',
        testMode: false,
        timeout: 60000,
        suppliers: [{ code: 'OTV', accesses: [{ accessId: '38327' }] }],
      },
    };

    console.log('[TGX Book] Variables:', JSON.stringify(variables).substring(0, 400));

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Apikey ${TRAVELGATEX_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
        'Connection': 'keep-alive',
      },
      body: JSON.stringify({ query: BOOK_MUTATION, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TravelgateX API ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL error: ${JSON.stringify(result.errors)}`);
    }

    const bookData = result.data?.hotelX?.book;
    console.log('[TGX Book] Response:', JSON.stringify(bookData).substring(0, 600));

    if (bookData?.errors?.length > 0) {
      throw new Error(`Book error: ${JSON.stringify(bookData.errors)}`);
    }

    const booking = bookData?.booking;
    if (!booking) {
      throw new Error('No booking data returned from TravelgateX');
    }

    return new Response(JSON.stringify({ data: booking }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('[TGX Book Error]', error.message);
    return new Response(JSON.stringify({ error: 'Book failed', details: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
