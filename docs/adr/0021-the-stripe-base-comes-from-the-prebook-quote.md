# The Stripe base comes from the prebook quote, not the client

The amount charged for a hotel is taken from the supplier quote recorded at prebook time in `hotel_prebook_quotes`, converted server-side. The `amount` in the checkout payload is treated as a claim about what the customer was shown — used only to decide whether to proceed, never as the price.

api-v2 did not do this. `createPayment` applied the markup directly to `params.amount` and sent the result to Stripe; `hotel_prebook_quotes` was read three times in v1 and not at all in api-v2, though the table and its Prisma model both existed. A payload asserting a lower amount was charged at that amount. v1 had closed this in `hotelChargeBase`; the port had carried the endpoint across without the rule inside it.

Prebook already held everything needed — `optionQuote.price` — and simply discarded it. So the fix is to persist what TGX quoted, then charge from that row.

## How a mismatch is resolved

The client figure still matters, because the customer must never be billed more than the page showed them. Within **HOTEL_FX_DISPLAY_TOLERANCE** (0.5%) the lower of the two is charged and any difference is absorbed; the tolerance sits below the markup, so absorbing it always costs less than the booking earns. Beyond it, checkout stops with `PRICE_CHANGED` and returns the server's figure for the customer to confirm. A missing quote, an expired one, or an unavailable conversion each stop the payment rather than fall back to the payload.

Recording the quote is deliberately non-fatal at prebook: if the write fails the prebook still succeeds, and checkout rejects the unknown `prebookId`. A customer retrying is a better failure than a prebook lost to a database blip.

## Consequences

- **Conversion for a charge must throw, never degrade.** `makeStrictConverter` refuses stale rates (>24h), unknown currencies and non-finite amounts, because returning an amount unconverted bills 5,800 PHP as 5,800 USD. `ExchangeRatesService` deliberately never throws and can serve a stale cache, so freshness is checked at the point of charge instead.
- **Rates are fetched only when the quote's currency differs from the charge currency.** Otherwise an FX outage would block bookings that need no conversion.
- **A prebook older than PREBOOK_QUOTE_TTL_MS (30 min) cannot be paid for.** The customer reselects the room. This is the supplier's price going stale, not a system fault.
- **Checkout now depends on a prebook write.** A `hotel_prebook_quotes` outage stops payments rather than charging unverified amounts — the intended trade, but it makes that table part of the booking path.
- **v1 and api-v2 now hold the same rule twice.** They should stay in step until v1 retires; `src/lib/payments/chargeBase.ts` is a deliberate copy of v1's `src/lib/bookings/hotelChargeBase.ts`.
