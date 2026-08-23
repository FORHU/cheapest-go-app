/**
 * Cancel a Duffel order that must not stay live.
 *
 * Duffel cancellation is two calls: create an `order_cancellation` (which
 * quotes the refund) and then confirm it. Doing only the first leaves the order
 * exactly as it was, so both have to succeed for the seat and the balance to
 * come back.
 *
 * Never throws. Every caller is already on an error or supersede path, and
 * replacing that failure with a different one helps nobody — the loud log is
 * the signal for ops to cancel by hand in the Duffel dashboard.
 */

const DUFFEL_API = 'https://api.duffel.com';

export async function cancelDuffelOrder(
    token: string | undefined,
    orderId: string,
    reason: string,
    fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
    if (!token || !orderId) return false;

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Duffel-Version': 'v2',
    };

    try {
        const quoteRes = await fetchImpl(`${DUFFEL_API}/air/order_cancellations`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ data: { order_id: orderId } }),
            signal: AbortSignal.timeout(15_000),
        });

        if (!quoteRes.ok) {
            const body = await quoteRes.text().catch(() => '');
            console.error(
                `[duffel-cancel] ORPHANED DUFFEL ORDER ${orderId} (${reason}) — ` +
                `cancellation quote failed (${quoteRes.status}): ${body}. Manual cancellation required.`,
            );
            return false;
        }

        const cancellationId = (await quoteRes.json())?.data?.id;
        if (!cancellationId) {
            console.error(`[duffel-cancel] ORPHANED DUFFEL ORDER ${orderId} (${reason}) — quote returned no cancellation id. Manual cancellation required.`);
            return false;
        }

        const confirmRes = await fetchImpl(
            `${DUFFEL_API}/air/order_cancellations/${cancellationId}/actions/confirm`,
            { method: 'POST', headers, signal: AbortSignal.timeout(15_000) },
        );

        if (!confirmRes.ok) {
            const body = await confirmRes.text().catch(() => '');
            console.error(
                `[duffel-cancel] ORPHANED DUFFEL ORDER ${orderId} (${reason}) — ` +
                `confirm failed (${confirmRes.status}): ${body}. Manual cancellation required.`,
            );
            return false;
        }

        console.log(`[duffel-cancel] Cancelled order ${orderId} (${reason}, cancellation ${cancellationId})`);
        return true;
    } catch (err: any) {
        console.error(`[duffel-cancel] ORPHANED DUFFEL ORDER ${orderId} (${reason}) — cancel threw: ${err?.message ?? err}. Manual cancellation required.`);
        return false;
    }
}
