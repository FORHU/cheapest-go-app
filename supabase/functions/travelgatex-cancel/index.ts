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
    const { clientReference, supplierReference } = body;

    if (!clientReference) {
      throw new Error('clientReference is required');
    }

    console.log('[TGX Cancel] Cancelling clientRef:', clientReference);

    const reference: any = { client: clientReference };
    if (supplierReference) {
      reference.supplier = supplierReference;
    }

    const variables = {
      input: { reference },
      settings: {
        client: TRAVELGATEX_CLIENT,
        context: 'TGX',
        testMode: false,
        timeout: 60000,
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

    return new Response(JSON.stringify({
      data: {
        bookingId: clientReference,
        status: 'cancelled',
        supplierReference: cancellation.reference?.supplier,
        cancelPolicy: cancellation.cancelPolicy,
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
