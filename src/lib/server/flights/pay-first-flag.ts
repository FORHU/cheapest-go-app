/**
 * FLIGHT_PAY_FIRST=on switches the web /api/flights/book route to the pay-first flow
 * (docs/adr/0045-…). Anything else keeps the order-before-payment flow of ADR-0009, so a
 * rollback is an environment change, not a deploy.
 */
export function isPayFirstEnabled(env: Record<string, string | undefined> = process.env): boolean {
    return env.FLIGHT_PAY_FIRST === 'on';
}
