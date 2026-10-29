# v2 audit — properties and flights, 2026-10-04

> **Both fixed 2026-10-05**, verified against the running stack. Astrotel Guadalupe now
> reads ₱802 on the search card, the map pin and the property page alike, for a one-night
> stay and a two-night one. MNL→ICN reports 112.50 per traveller whether the search is for
> one adult or three. Details at the end of each finding.

Both funnels answer every request and return real data. What they disagree about is **what
a price means**, and in two places a figure covering several units is printed with a
per-unit label.

Both defects share a shape, and it is the shape that makes them survive: they are exactly
correct when the quantity is one. A one-night stay, or a search for one adult, shows the
right number. That is also why the screenshot that started this — a 2026-10-15 → 10-16
stay — looked fine on price.

Measured against v1 on live, which is the working reference.

---

## BG-A — the hotel search card prints the whole stay as the nightly rate

**Severity: high.** It is the headline figure on every search card and it overstates by the
number of nights.

`GET/POST /api/v2/hotels/search` returns the **Stay Total**. Astrotel Guadalupe, Makati:

| Stay | Search says | Property page says |
|---|---|---|
| 20–21 Oct (1 night) | ₱802 | ₱802 |
| 20–22 Oct (2 nights) | **₱1,604** | **₱802** |

The property endpoint divides (`hotels.service.ts`, `price: (r.price ?? 0) / roomNights`).
The search path never does — `lib/hotels/search.ts:1705` is `price: opt.price.gross` and
`nightsBetween` appears nowhere in it.

The card prints it with a night label anyway, on the strength of a comment that is wrong:

```ts
// src/app/[locale]/search/page.tsx:346
// Already per night: api-v2 divides the supplier's stay total before sending it, the
// same contract v1 has. Dividing again here would quote a third of the real rate.
const price = convertCurrency(property.price, property.currency || 'USD', currency);
```

**The map disagrees with the list on the same screen.** The map surfaces divide; the card
does not. On a two-night search the pin reads ₱802 and the card beside it reads ₱1,604 for
the same hotel.

| Surface | Divides by nights | |
|---|---|---|
| `app/[locale]/search/page.tsx:349` (the card that renders) | no | ✗ |
| `features/search/components/rail-card.tsx:77` (second copy) | no | ✗ |
| `shared/components/mapbox/SearchMapContainer.tsx:220` | yes | ✓ |
| `shared/components/mapbox/components/SelectedPropertyPopup.tsx:359,496` | yes | ✓ |
| `shared/components/mapbox/utils/buildGeoJson.ts:23` (fallback branch) | no | ✗ |
| `features/checkout/components/booking-summary.tsx:65` | yes | ✓ |
| property room cards | API divides | ✓ |

**v1 does not have this.** Its stream carries two price-bearing frames with different
meanings, and the UI reads the right one. Over 47 hotels present in both a one-night and a
two-night search:

```
prices frame      41 unchanged, 0 doubled   → Nightly Rate   ← what v1's UI reads
done.allMappable   0 unchanged, 43 doubled  → Stay Total
```

v2 collapsed those two into one field and kept the Stay Total.

### The fix, and why it is two changes

**Derive once, in the API** — the rule [CONTEXT.md](../CONTEXT.md) already states for
**Nightly Rate**, and what the property endpoint already does. The search response should
carry the nightly figure.

That makes the card correct and the **map wrong**, because the map divides today. So the
`/ nights` at `SearchMapContainer.tsx:220` and `SelectedPropertyPopup.tsx:359,496` comes
out in the same change, and `buildGeoJson.ts:23`'s raw fallback stops mattering.

Doing only one half is worse than doing neither: today the two surfaces disagree and one of
them is right, and a half-fix leaves them disagreeing with the other one right.

The duplicate `RailCard` — one in `features/search/components/rail-card.tsx`, one defined
inside `app/[locale]/search/page.tsx:323` — should collapse to one while this is open.
Two copies of a price rule is how the two surfaces drifted apart.

### Fixed 2026-10-05

`buildCityResults` now takes the stay's night count and divides, using the shared
`nightsBetween` the property endpoint already used — whose own doc comment had claimed all
along that the search path shared it. All four call sites pass it. The `/ nights` came out
of `SearchMapContainer.tsx`, both sites in `SelectedPropertyPopup.tsx`, and the now-dead
`nights` prop was removed from the chain down to the search page, because a spare `nights`
sitting beside a price is what invites the division back.

Verified live — Astrotel Guadalupe, Makati:

| | 1 night | 2 nights |
|---|---|---|
| search card | ₱802 | ₱802 |
| property page | ₱802 | ₱802 |

The dead `RailCard` in `features/search/components/rail-card.tsx` was left alone: with the
wire now carrying the nightly figure, it is correct, and deleting it is tidying rather than
a fix. Its `railCardPalette` is still imported by `status-screen.tsx`.

---

## BG-B — a flight's "per person" price is the whole party's

**Severity: high**, and it scales with party size.

`pricePerAdult` comes back equal to `total` on every Duffel offer. MNL→ICN, 15 Nov:

| Adults | `total` | `pricePerAdult` | should be |
|---|---|---|---|
| 1 | 112.50 | 112.50 | 112.50 |
| 2 | 225.00 | **225.00** | 112.50 |
| 3 | 337.50 | **337.50** | 112.50 |

`total` is right. `pricePerAdult` is the party total wearing a per-person label.

```ts
// api-v2 src/lib/flights/duffel.ts:691
pricePerAdult: (raw as any).pricePerAdult ?? price,
```

Duffel sends no `pricePerAdult`, so it is always the fallback — `price`, the party total.

The client already has the correct arithmetic and never reaches it, because the API always
supplies the field:

```ts
// app-v2 src/features/flights/components/flight-card.tsx:160
const pricePerPerson = offer.price?.pricePerAdult ?? (adults > 0 ? priceTotal / adults : priceTotal);
```

Rendered at `flight-card.tsx:464` with a `/person` suffix. A family of three sees every
fare at three times the real one.

**Mystifly is not affected** — `lib/flights/mystifly.ts:231-241` sums the per-pax fares
properly. Only the Duffel path is wrong, and Duffel is the live provider.

### The fix

Divide in `duffel.ts`, where the passenger count is known, rather than deleting the field
and leaning on the client's fallback — a second client would have to reinvent it. Keep the
client's fallback as the belt.

### Fixed 2026-10-05

`pricePerAdult: price / Math.max(1, raw?.passengers?.length ?? 1)`. The raw Duffel offer
carries its `passengers` array with `type: "adult"`, so the count is on the offer itself.
The `Math.max(1, …)` is not decoration: a party of zero would send `Infinity` to a price
label.

It is an **average per traveller**, not an adult fare — Duffel prices the offer whole and
publishes no per-passenger breakdown, so a party with children spreads their cheaper seats
across everyone. For an adults-only party, which is nearly all of them and what the
client's fallback already assumed, the two are the same number. The comment in `duffel.ts`
says so.

Six tests in `src/__tests__/duffelPricePerAdult.test.ts`; three of them fail against the
old expression. Verified live: MNL→ICN reports 112.50 per traveller at 1, 2 and 3 adults,
with `total` still 112.50 / 225 / 337.50.

---

## What is healthy

Verified end to end against the running stack on 2026-10-04:

| | |
|---|---|
| Hotel search, Makati 20–22 Oct | 114 results, all priced, all with images (25 s) |
| v1 parity | every one of v1's 73 hotels present; v2 finds 41 more, all cheaper than v1's cheapest |
| Price agreement with v1 | 66 of 73 within 1% — the 7 outliers are live rate drift between the two runs |
| Currency | PHP on both sides, no mismatch |
| Property 7388287 | 8 grouped cards, photos on all, 31 rates |
| Hotel prebook | valid quote token, 12 s |
| Flight search MNL→ICN | 108 offers, 2.6 s, `base`/`taxes` populated, no failed providers |
| Flight revalidate | seats available, price unchanged |
| App pages | `/`, `/search`, `/property/[id]`, `/flights/search`, `/flights/book`, `/checkout`, `/deals` all 200 |

v2 finding 41 hotels v1 misses is coverage, not noise: the one checked (Astrotel Guadalupe)
has six bookable rooms on its property page.

---

## Not covered

- **Anything behind a session.** `create-payment`, `confirm` and flight `book` all need
  `req.user.sub`. Needs a local login to drive.
- **The rendered UI.** Rooms are fetched client-side, so a curl sees an empty shell, and
  there is no browser automation on this machine. Everything above is API-level or read
  from source.
- **Bags, seat maps, fare rules, cancellation and refunds.** Endpoints exist; none exercised.
- **Hotel booking** is deliberately untested — it reaches the live supplier.
