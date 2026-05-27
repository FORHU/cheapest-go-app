import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CANCEL_MUTATION = `
mutation CancelHotel(
  $input: HotelCancelInput!
  $settings: HotelSettingsInput!
) {
  hotelX {
    cancel(input: $input, settings: $settings) {
      cancellation {
        reference {
          supplier
          client
          hotel
        }
        status
        price {
          currency
          net
          gross
        }
      }
      errors { code type description }
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
    const { clientReference, supplierReference, tgxBookingId } = body;

    if (!clientReference && !tgxBookingId) {
      throw new Error('clientReference or tgxBookingId is required');
    }

    console.log('[TGX Cancel] Cancelling clientRef:', clientReference, '| tgxBookingId:', tgxBookingId?.substring(0, 40));

    // Use TGX internal booking ID if available — most reliable (OTV requires it)
    // Fall back to reference object (client + supplier refs)
    const input: any = tgxBookingId
      ? { bookingID: tgxBookingId }
      : { reference: { client: clientReference, ...(supplierReference ? { supplier: supplierReference } : {}) } };

    const variables = {
      input,
      settings: {
        client: TRAVELGATEX_CLIENT,
        context: 'OTV',
        testMode: false,
        timeout: 60000,
        suppliers: [{ code: 'OTV', accesses: [{ accessId: '38327' }] }],
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
      body: JSON.stringify({ query: CANCEL_MUTATION, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TravelgateX API ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL error: ${JSON.stringify(result.errors)}`);
    }

    const cancelData = result.data?.hotelX?.cancel;
    console.log('[TGX Cancel] Response:', JSON.stringify(cancelData).substring(0, 500));

    if (cancelData?.errors?.length > 0) {
      throw new Error(`Cancel error: ${JSON.stringify(cancelData.errors)}`);
    }

    const cancellation = cancelData?.cancellation;
    if (!cancellation) {
      throw new Error('No cancellation data returned from TravelgateX');
    }

    const otvStatus = cancellation.status;
    console.log('[TGX Cancel] OTV cancellation status:', otvStatus);

    if (otvStatus !== 'CANCELLED') {
      throw new Error(`OTV cancellation not confirmed — status: ${otvStatus}`);
    }

    return new Response(JSON.stringify({
      data: {
        bookingId: clientReference,
        status: 'cancelled',
        otvStatus,
        supplierReference: cancellation.reference?.supplier,
        price: cancellation.price,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('[TGX Cancel Error]', error.message);
    return new Response(JSON.stringify({ error: 'Cancel failed', details: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
