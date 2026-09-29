# ADR-0042: A hotel's country is corrected where it is read, and never decided by a box alone

## Status

Accepted

## Context

QA BG-8 reported that a "Hong Kong" search surfaced Shenzhen hotels and that Hong Kong addresses
read "…Hong Kong, CN". Both were true, and an audit of all 1,138,445 hotels in live `hotel_content`
on 2026-09-14 showed they were two instances of wider problems.

**Territories filed under the country they belong to.** Every Hong Kong hotel was stored as CN.
So were Guam's as US; Réunion, Guadeloupe, Martinique, French Guiana and Mayotte as FR; Jersey
and Guernsey as GB; Saint Eustatius as NL; Norfolk and Christmas Island as AU. That's 2,664 hotels. A
search for one of those places carries the territory's own ISO code, so it matched none of them,
and every address named the wrong country.

**Hand-drawn country boxes dropping real hotels.** After a supplier search, hotels whose
coordinates fell outside `COUNTRY_BBOX` for the searched country were removed as "confirmed
out-of-country". The comment promised a ±2° buffer; the boxes had none. Many were drawn at the
border or left out islands, and 3,950 hotels in 73 countries were being dropped from searches of
their own country: 170 of Uruguay's 313 (Montevideo, Punta del Este), all of Galápagos,
Montego Bay, Dakar, Penghu and Kinmen, Easter Island, Guadeloupe and Martinique.

## Decision

**1. Territory codes are corrected where hotel content is read, not rewritten in the database**
(`src/lib/geo/territories.ts`). A supplier re-sync writes the parent's code straight back, so a
one-off data fix would decay. Every reader that shows or filters on a hotel's country goes
through `hotelCountry()`, and queries for a territory also match rows stored under its parent
(`storedCountryCodes()`).

- Islands and overseas territories are recognised **by coordinates**. Out at sea a box is
  unambiguous, and a rule only converts rows already filed under that territory's parent. A
  British Virgin Islands hotel filed GB is never taken for the US Virgin Islands next door.
- Territories with a **land border** (Hong Kong, Macao, Gibraltar) are recognised **by city
  name**. Coordinates can't separate them from their neighbour: Shenzhen lies inside Hong Kong's
  box, and La Línea de la Concepción inside Gibraltar's. For Hong Kong, a name match is also
  overruled when the hotel is clearly north of the Shenzhen River, because Luohu hotels arrive filed
  under "North District", which is also a Hong Kong district.
- **Disputed areas are deliberately absent** (Western Sahara, the West Bank, Abkhazia, Northern
  Cyprus). Which code they carry is a political decision, not a data error.

**2. A hotel is out of country only when two kinds of evidence agree**
(`isConfirmedOutOfCountry`): its corrected stored country differs from the searched one, **and**
its coordinates fall outside that country's box, buffered by 1°. A matching country is never
overruled by coordinates, which fixes the islands and border cities. Coordinates are still needed
because a supplier row with no country is stamped with the searched one. Land-border territories
are decided by country alone, for the reason above.

**3. A territory's 50 km instant-catalog circle stays on its own side of the border.** Hong Kong's
circle reaches all of Shenzhen, and Jersey's reaches Guernsey. Other countries keep the
cross-border circle, because that is its purpose (Jeju reaching Seogwipo).

## Consequences

- Measured on live after the change: no hotel is dropped from a search of its own country
  (previously 3,950). 2,664 hotels show their territory. A Hong Kong search returns
  Hong Kong and Kowloon hotels with none from Shenzhen, and a Guam search returns Guam's hotels
  labelled GU.
- A new territory means one entry in `territories.ts`. Add the name rule if it has a land border,
  otherwise a box.
- `scratch/audit-country-codes.mjs` and `scratch/verify-country-rules-live.ts` re-run both audits.
  Run them after any supplier content import that changes where hotels come from.
- Stored rows stay wrong. Anything reading `hotel_content.country` directly without
  `hotelCountry()` (an admin export, an ad-hoc SQL report) still sees CN for Hong Kong.
- Two Hong Kong hotels within ~300 m of the border line stay HK. Supplier coordinates are too
  rough to decide them.
