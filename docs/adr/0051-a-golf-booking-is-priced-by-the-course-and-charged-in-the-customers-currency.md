# A golf booking is priced by the course and charged in the customer's currency

A course prices its tee times in its own currency. A customer sees them, and is charged, in a
Charge Currency of their choosing (KRW, USD or PHP), converted on the server. This is the model
hotels and flights already follow (CONTEXT.md, "Display Currency", "Charge Currency", "Supplier
Currency"); golf had sidestepped it by charging in whatever currency the course was in. This
records how golf joins it, because the pieces are easy to cross.

**The course never sees the customer's currency.** Schedules, extras, blocks and the portal stay
in the course's currency, and `CourseBookingView` reports the green fee in it. What a course is
owed is what it set, whatever a customer paid in; settlement with the course stays in its own
currency.

**One function prices everything.** `quoteGolf` takes the course's currency and the charge
currency and converts each component on its own (the green fee, then each extra's line), then
puts the service fee on the converted base, with the fee's flat USD part converted as hotels do.
Because the parts are rounded one by one, to the currency's own precision (`roundToCurrency`:
whole won, cents elsewhere), every line adds up to its total exactly, and what is shown is the
number sent to Stripe. Search, the picker, the checkout page and the hold all call it, so a
result's price is the price the card is authorised for.

**The rate is fixed at the hold.** The PaymentIntent is created in the charge currency for the
quoted total, and `charge_rate` records the rate used. The customer is held to the total they
were shown: `displayedTotal` goes through `capAtDisplayedTotal`, so a small drift is ours to
absorb and a larger one is refused as `price_changed` with the new total, before any card is
authorised. A repeated request resumes an existing hold only when it is in the same currency.

**Rates are strict.** Quoting uses `convertCurrencyStrict`: an unknown or stale (over 24h) rate
fails the quote, never a guess. The search and picker leave a tee time without an all-in price;
the checkout page falls back to the course's default currency; the hold answers 503
`rates_unavailable`. A course cannot be saved in a currency we hold no rate for.

**Which currency, when the customer has not said.** The URL's `?currency=` wins (a shared link
names what it was shared in), then the cookie `cg_currency`, then the course's own currency when
customers can be charged in it, otherwise USD. The cookie is a mirror of the selector's choice
(`searchStore.userCurrency`) written by one component in the root layout, so the selector, geo
detection and checkout's card-country switch need no changes. It is a preference, not a
credential: it is read back only through `readViewerCurrency`, which accepts nothing but a Charge
Currency. A course priced in a currency customers are not charged in (say THB) is therefore
charged in USD unless they choose otherwise; before, it was charged in baht.

**What a booking row means now.** The existing columns (`price_per_player`, `green_fee_total`,
`service_fee`, `extras_total`, `total`, `currency`) stay in the course's currency: `service_fee`
and `total` are the charged amounts restated at the locked rate. New `charge_currency`,
`charge_rate` and `charged_*` columns hold the customer's side, and `GolfBooking` exposes the
customer's figures as `total`, `serviceFee`, `greenFeeTotal`, `currency` (so every receipt,
email and refund that read those keeps working unchanged) and the course's as `course*`. Rows
from before are backfilled with charge = course at a rate of 1. A refund is issued in the charge
currency, for the charged total, so the customer sees no FX drift; `refund_amount` is in that
currency.

**The payment is restated in USD when it is taken**, at capture, into `usd_amount`, `fx_rate`,
`fx_captured_at`, `fx_source` (ADR-0008). `lockFx` never fails the confirmation; a booking
without a rate is left null to be backfilled.

## Known gaps

- **The first request has no cookie.** A visitor's first page load renders in the course's
  currency; the next navigation uses their choice. A redirect would fix it and is not worth the
  cost.
- **The landing page's golf row is in course currency.** It is part of a page that is not
  rendered per viewer; reading a cookie there would make the home page dynamic.
- **Golf is not in the admin revenue and dashboard queries**, so the USD lock makes reporting
  possible but does not report. That is a reporting change of its own.
- **Per-item prices are informational.** "Cart, 25.00 each" is the item converted on its own; a
  line of several can differ from `quantity × each` by a unit of the currency's smallest step.

## Considered options

- **Display only, charge in the course's currency.** Rejected: the customer pays a different
  number from the one converted on screen, and Stripe would be asked to charge currencies outside
  the three we chose to serve.
- **Send every price in all three currencies and let the client pick.** Cleaner for caching, but
  it doubles every payload and still needs the server to know the currency at checkout. The
  cookie keeps the pages server-rendered and the price single.
- **Convert in the browser.** Rejected, as CONTEXT.md warns: two conversions drift and checkout
  shows a different number.
- **Redefine the existing columns as the charge currency.** Simpler migration, but the course's
  figure is then derived from a converted one, so a rate change would move what a course is owed.
