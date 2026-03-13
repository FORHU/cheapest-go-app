/**
 * refresh-deal-prices — Supabase Edge Function
 *
 * Runs every 6 hours via pg_cron.
 * For each row in `flight_deals`, calls unified-flight-search to get live prices,
 * picks the cheapest offer, and updates the row.
 *
 * baseline_price is NEVER changed — it's the fixed "was" reference price.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

declare const Deno: any;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeDiscountTag(livePrice: number, baseline: number): string {
    if (baseline <= 0 || livePrice >= baseline) return ''
    const pct = Math.round((1 - livePrice / baseline) * 100)
    return pct > 0 ? `${pct}% OFF` : ''
}

function computeEndsIn(departureDateStr: string | null): string {
    if (!departureDateStr) return 'Limited Time'
    const diffMs = new Date(departureDateStr).getTime() - Date.now()
    if (diffMs <= 0) return 'Expired'
    const days = Math.floor(diffMs / 86_400_000)
    const hours = Math.floor((diffMs % 86_400_000) / 3_600_000)
    if (days > 30) return `${Math.floor(days / 7)}w`
    if (days > 0) return `${days}d ${hours}h`
    return `${hours}h`
}

function toYMD(date: Date): string {
    return date.toISOString().split('T')[0]
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (_req: Request) => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    const supabase = createClient(supabaseUrl, serviceKey)
    const searchUrl = `${supabaseUrl}/functions/v1/unified-flight-search`

    // 1. Load all deal rows
    const { data: deals, error: loadErr } = await supabase
        .from('flight_deals')
        .select('id, origin, destination, departure_date, return_date, baseline_price')

    if (loadErr) {
        console.error('[refresh-deal-prices] Failed to load deals:', loadErr.message)
        return new Response(JSON.stringify({ error: loadErr.message }), { status: 500 })
    }

    console.log(`[refresh-deal-prices] Processing ${deals?.length ?? 0} deals`)

    // 2. Refresh each deal in parallel
    const results = await Promise.allSettled(
        (deals ?? []).map(async (deal: any) => {
            const departureDate = deal.departure_date
                ? String(deal.departure_date)
                : toYMD(new Date(Date.now() + 30 * 86_400_000))

            const returnDate = deal.return_date ? String(deal.return_date) : undefined
            const tripType = returnDate ? 'round-trip' : 'one-way'

            const segments: any[] = [
                { origin: deal.origin, destination: deal.destination, departureDate }
            ]
            if (returnDate) {
                segments.push({ origin: deal.destination, destination: deal.origin, departureDate: returnDate })
            }

            // Call unified-flight-search — it fans out to duffel-search + mystifly-search
            const searchRes = await fetch(searchUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${anonKey}`,
                },
                body: JSON.stringify({
                    segments,
                    tripType,
                    adults: 1,
                    cabinClass: 'economy',
                    maxOffers: 5,          // Only need cheapest — limit for speed
                }),
            })

            let raw: any = {}
            try { raw = await searchRes.json() } catch { /* ignore */ }

            if (!raw.success) {
                throw new Error(raw.error || `Search failed (HTTP ${searchRes.status}) for ${deal.origin}→${deal.destination}`)
            }

            const flights: any[] = raw.flights ?? []
            if (flights.length === 0) {
                // No flights found — skip update, don't count as fatal failure
                console.warn(`[refresh-deal-prices] No flights for ${deal.origin}→${deal.destination} — skipping`)
                return { skipped: true, route: `${deal.origin}→${deal.destination}` }
            }

            // Pick cheapest by normalizedPriceUsd (already sorted by unified-flight-search)
            const cheapest = flights.reduce(
                (min: any, f: any) =>
                    (f.normalizedPriceUsd ?? f.price) < (min.normalizedPriceUsd ?? min.price) ? f : min,
                flights[0]
            )

            const livePrice = Number(cheapest.price ?? cheapest.normalizedPriceUsd)
            const liveAirline = cheapest.airline ?? cheapest.airlineName ?? cheapest.operatingAirline ?? null
            const baseline = Number(deal.baseline_price ?? 0)

            const patch = {
                price: livePrice,
                airline: liveAirline,
                discount_tag: computeDiscountTag(livePrice, baseline),
                ends_in: computeEndsIn(deal.departure_date),
                last_refreshed_at: new Date().toISOString(),
            }

            const { error: upErr } = await supabase
                .from('flight_deals')
                .update(patch)
                .eq('id', deal.id)

            if (upErr) throw upErr

            console.log(
                `[refresh-deal-prices] ✓ ${deal.origin}→${deal.destination} ` +
                `$${livePrice} ${patch.discount_tag || '(no discount)'}`
            )
            return { route: `${deal.origin}→${deal.destination}`, price: livePrice }
        })
    )

    const succeeded = results.filter((r: any) => r.status === 'fulfilled').length
    const failed = results.filter((r: any) => r.status === 'rejected')

    failed.forEach((r: any, i: number) =>
        console.error(`[refresh-deal-prices] ✗ [${i}]:`, r.reason?.message ?? r.reason)
    )

    return new Response(
        JSON.stringify({ succeeded, failed: failed.length, total: results.length }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
    )
})
