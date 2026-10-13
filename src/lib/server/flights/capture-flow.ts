export type CaptureFlow = 'order_first' | 'authorise_first';

/**
 * Whether new Duffel bookings authorise the card before the order is bought.
 *
 * Read once, when /book creates the PaymentIntent, and stamped on the intent as `captureFlow`.
 * Everything after that routes by the stamp (see captureFlowOf), never by this flag, so turning
 * the flag off cannot strand a payment that is already in flight.
 */
export function resolveCaptureFlow(env: Record<string, string | undefined> = process.env): CaptureFlow {
    return env.DUFFEL_MANUAL_CAPTURE?.trim().toLowerCase() === 'on' ? 'authorise_first' : 'order_first';
}

/** The flow an intent was created under. No stamp means it predates the flag: order first. */
export function captureFlowOf(metadata: Record<string, string> | null | undefined): CaptureFlow {
    return metadata?.captureFlow === 'authorise_first' ? 'authorise_first' : 'order_first';
}
