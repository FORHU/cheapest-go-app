# Room photos come from ETG, not from the booking supplier

TravelgateX is where we shop and book hotels, but the photos on a room card come from ETG (WorldOTA/RateHawk) and are matched to each TGX room by name. `hotel_content.room_groups` holds the ETG groups, seeded on demand from `hotel/info` and stored per hotel; `matchEtgRoomGroup` links a TGX room description to one of them.

We chose this because our supplier returns nothing to use. Queried directly on 2026-08-25 — six real room codes taken from live TGX offers, then again with no filter at all and `maxSize: 25` — OTV answered `roomData: null` every time. Introspecting `HotelXRoomQueryInput` confirmed the query was complete: it accepts only `access`, `roomCodes` and `maxSize`, so there was no setting we had failed to send. The supplier simply does not publish room-level static content through TGX today.

Name matching is the only join available, because nothing links a TGX room code to an ETG room group. TGX calls a room "Deluxe Double room with river view" while ETG files its photos under "Deluxe Double room with river view (full double bed)", so `matchEtgRoomGroup` is a cascade of increasingly loose comparisons — ETG bedding type, exact name, prefix, parentheses stripped, then bed-type keyword — ordered so a confident match always beats a plausible one. It deliberately has no tier-word fallback: matching on "deluxe" alone hands the same photos to every room of that grade, and on a page someone books from a wrong photo is worse than no photo. An unmatched room falls back to the hotel gallery, which is honest.

Audited across all 959 hotels with seeded groups and 38,811 room descriptions, exactly one hotel had two differently-named rooms land on the same group — "economy single room" and "standard single room", both single rooms, where Economy has no group of its own.

## Consequences

- **Room photos depend on a supplier we do not book through.** Losing the ETG credentials costs every room image while leaving booking entirely intact, and nothing in the booking path would report it.
- **Rooms routinely share photos, and that is the supplier's data, not a matching fault.** 49.1% of room-group pairs at a hotel share at least one photo, averaging 65.7% overlap where they do. Correct matching still produces cards that look identical, which is why the gallery is ordered to lead with each room's distinctive shots (`orderRoomPhotosByDistinctiveness`). Hotel Naru Seoul, where a guest reported the problem, was an ordinary hotel rather than an unlucky one.
- **`room_groups` has two shapes.** An ETG-seeded array of named groups, and an older TGX map keyed by room code. Both are read. The column defaults to `[]`, so emptiness alone says nothing — `room_groups_seeded_at` is what distinguishes "asked, and there is none" from "never asked".
- **The TGX rooms query is kept working even though OTV fills nothing.** It was silently broken for some time, asking for `area { size metric }` after `Area` became a scalar, which failed the whole query on every call. ONDA and Rakuten are the next suppliers, and they may populate what OTV does not.
- **This decision is worth revisiting when a supplier does return room content.** It is not a preference; it is a workaround for an empty response.
