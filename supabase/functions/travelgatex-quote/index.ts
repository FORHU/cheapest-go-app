import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const QUOTE_QUERY = `
query QuoteHotel(
  $criteria: HotelCriteriaQuoteInput!
  $settings: HotelSettingsInput!
) {
  hotelX {
    quote(criteria: $criteria, settings: $settings) {
      optionQuote {
        status
        price {
          currency
          binding
          net
          gross
        }
        cancelPolicy {
          refundable
          cancelPenalties {
            deadline
            penaltyType
            currency
            value
          }
        }
        boardCode
        paymentType
        token
        rooms {
          occupancyRefId
          code
          description
        }
        remarks
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
    const { token } = body;

    if (!token) {
      throw new Error('token is required');
    }

    console.log('[TGX Quote] Quoting token:', token.substring(0, 80));

    const variables = {
      criteria: { token },
      settings: {
        client: TRAVELGATEX_CLIENT,
        context: 'OTV',
        testMode: false,
        timeout: 15000,
      },
    };

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Apikey ${TRAVELGATEX_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
        'Connection': 'keep-alive',
      },
      body: JSON.stringify({ query: QUOTE_QUERY, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TravelgateX API ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL error: ${JSON.stringify(result.errors)}`);
    }

    const quoteData = result.data?.hotelX?.quote;
    console.log('[TGX Quote] Response:', JSON.stringify(quoteData).substring(0, 500));

    if (quoteData?.errors?.length > 0) {
      throw new Error(`Quote error: ${JSON.stringify(quoteData.errors)}`);
    }

    const optionQuote = quoteData?.optionQuote;
    if (!optionQuote) {
      throw new Error('No quote option returned from TravelgateX');
    }

    return new Response(JSON.stringify({ data: optionQuote }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('[TGX Quote Error]', error.message);
    return new Response(JSON.stringify({ error: 'Quote failed', details: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
