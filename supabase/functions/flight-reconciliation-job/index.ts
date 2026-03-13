import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Defines the shape of our internal DB fields
interface BookingRecord {
    id: string;
    pnr: string;
    provider: string;
    provider_order_id: string;
    status: string;
    total_price: number;
}

serve(async (req) => {
    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Missing Supabase configuration");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Fetch all bookings in transient states that need active reconciliation
        const { data: bookings, error } = await supabase
            .from("flight_bookings")
            .select("id, pnr, provider, provider_order_id, status, total_price")
            .in("status", ["booked", "awaiting_ticket", "cancel_requested", "refund_pending"]);

        if (error) {
            throw error;
        }

        if (!bookings || bookings.length === 0) {
            return new Response(JSON.stringify({ message: "No bookings require reconciliation.", count: 0 }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        console.log(`[Reconciliation] Starting run for ${bookings.length} transient bookings...`);
        let synced = 0;
        let failed = 0;

        for (const booking of bookings as BookingRecord[]) {
            try {
                let actualStatus = booking.status;
                let refundAmount = 0;
                let eventType = null;
                let supplierSnapshot = null;

                // 2. Fetch ground-truth status from Supplier
                if (booking.provider === "duffel") {
                    const duffelToken = Deno.env.get("DUFFEL_ACCESS_TOKEN");
                    if (!duffelToken) continue;

                    // Fetch the Order from Duffel 
                    const duffelRes = await fetch(`https://api.duffel.com/air/orders/${booking.provider_order_id}`, {
                        headers: {
                            "Accept": "application/json",
                            "Duffel-Version": "v2",
                            "Authorization": `Bearer ${duffelToken}`
                        }
                    });

                    if (duffelRes.ok) {
                        const result = await duffelRes.json();
                        const order = result.data;
                        supplierSnapshot = order;

                        // Map Duffel conditions to Local Statuses
                        if (!order.cancelled_at) {
                            // Not cancelled, check ticketing
                            // (Note: Duffel auto-tickets immediately on test tokens, but async allows holding states)
                            // We assume 'ticketed' if we can see document IDs or the order was successful
                            actualStatus = "ticketed";
                        } else {
                            // Cancelled
                            actualStatus = "refunded";
                            // Note: Usually Duffel exposes refund amounts during the cancellation sub-request.
                            // For a true sync we would fetch the Cancellations route: /air/cancellations
                        }
                    }
                } else if (booking.provider === "mystifly" || booking.provider === "mystifly_v2") {
                    // For Mystifly, you would call `RetrieveFlightDetails` or similar via PNR
                    // For skeleton purposes, assume status unchanged unless manually coded
                }

                // 3. Compare and Repair Inconsistencies
                if (actualStatus !== booking.status) {
                    console.log(`[Reconciliation] Booking ${booking.id} drift detected! DB: ${booking.status} -> Actual: ${actualStatus}`);

                    // Log Financial Ledger if refund detected
                    if (actualStatus === "refunded") {
                        eventType = "supplier_reconciliation";
                        await supabase.from("booking_financial_events").insert({
                            booking_id: booking.id,
                            event_type: "refund",
                            amount: refundAmount > 0 ? refundAmount : booking.total_price, // fallback if API doesn't specify explicitly
                            currency: "USD",
                            provider: booking.provider,
                            transaction_id: `recon_${booking.pnr || booking.provider_order_id}`,
                            metadata: { source: "nightly_reconciliation", previousStatus: booking.status, payload: supplierSnapshot }
                        });
                    }

                    // Update Status
                    await supabase.from("flight_bookings")
                        .update({ status: actualStatus })
                        .eq("id", booking.id);

                    // Write to cancellation log
                    const asyncLog = {
                        at: new Date().toISOString(),
                        oldStatus: booking.status,
                        newStatus: actualStatus,
                        note: `Reconciliation cron job override.`,
                        snapshot: supplierSnapshot
                    };

                    await supabase.rpc('append_cancellation_log', {
                        b_id: booking.id,
                        log_entry: asyncLog
                    });

                    synced++;
                }

            } catch (err) {
                console.error(`[Reconciliation] Failed syncing booking ${booking.id}:`, err);
                failed++;
            }
        }

        return new Response(JSON.stringify({
            success: true,
            processed: bookings.length,
            synced,
            failed
        }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (err: any) {
        console.error("[Reconciliation Engine] Fatal Error:", err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
});
