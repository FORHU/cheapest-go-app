// Follow Duffel/Supabase edge function patterns
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const internalSecret = Deno.env.get('INTERNAL_SECRET') ?? 'placeholder-internal-secret'
    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:3000'

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Get Top 5 Popular Routes
    const { data: popularRoutes, error: fetchError } = await supabase
      .from('flight_search_stats')
      .select('origin, destination')
      .order('search_count', { ascending: false })
      .limit(5)

    if (fetchError) throw fetchError

    console.log(`Found ${popularRoutes?.length} popular routes to refresh.`)

    // 2. Trigger Refresh for each route
    const results = await Promise.allSettled(
      (popularRoutes || []).map(async (route) => {
        const response = await fetch(`${appUrl}/api/internal/refresh-flights`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${internalSecret}`
          },
          body: JSON.stringify({
            origin: route.origin,
            destination: route.destination,
            // For cron, we look ~7 days ahead as a default "high interest" window
            departureDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            cabinClass: 'economy'
          })
        })
        
        if (!response.ok) {
            throw new Error(`Failed to refresh ${route.origin}->${route.destination}: ${response.statusText}`)
        }
        return route
      })
    )

    return new Response(JSON.stringify({ results }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
