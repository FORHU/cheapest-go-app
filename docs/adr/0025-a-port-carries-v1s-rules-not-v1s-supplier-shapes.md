# A port carries v1's rules, not v1's supplier shapes

When a Slice ports a v1 module whose types are modelled on a supplier we no longer use, the behaviour crosses and the types do not. The rules are re-expressed against the shape the live supplier actually sends, and v1's file is read as a specification rather than copied — the same reading [ADR-0016](0016-parity-is-functional-not-visual.md) already applies to components, extended to the parts of the backend that carry a dead supplier's vocabulary.

The case that forced it was room names. `src/lib/room/roomUtils.ts` holds rules worth having — a name stripped to under three characters is a supplier code and not a room type, so "U (Superior Double room)" keeps its parentheses rather than titling a card "U"; TGX appends the rate to the name, so "Standard Double room - Non-refundable" is one room and not two. api-v2 had none of this. It displayed and deduplicated on TGX's raw string.

But `roomUtils` is typed on LiteAPI's room-and-offer model — `RoomType` documented as "each roomType is actually an offer", with `retailRate`, `refundableTag` and `cancelPolicyInfos` — and imports `RateOption` from `@/components/property/RoomCard`. LiteAPI supplies nothing today (see **LiteAPI** in [CONTEXT.md](../../CONTEXT.md)). Copying the file whole would have installed a retired supplier's data model, plus a frontend component import, in the backend [ADR-0017](0017-api-v2-owns-all-domain-logic.md) says owns all domain logic.

We know what that costs because it had already happened. api-v2 carried `normalizeLiteApiPolicy` with **zero callers**, and `rawLiteapiResponse` on a public type, both of which rode across during an earlier port and were removed on 2026-09-02. An exported function nobody calls is worse than no function: it reads as supported.

The rules themselves turned out not to need the shapes at all. `normalizeRoomName`, `isMeaningfulRoomName` and `extractRoomVariantLabel` are already `string → string` in v1 — they were always about the text a supplier sends, never about which supplier sent it — so they ported unchanged into `api-v2/src/lib/hotels/roomNames.ts`. Only the display-name resolution was genuinely LiteAPI-shaped, and only that was rewritten.

## Consequences

- **v1 and v2 are deliberately not file-for-file here.** Someone diffing the two repos will find no `roomUtils.ts` in api-v2 and should not create one. The rules live in `roomNames.ts`, typed on TGX.
- **This is a rewrite per module, not a copy, and it is slower.** The judgement has to be made each time: which parts of a v1 module are rules, and which are one supplier's vocabulary. C2 and C3 both face it — v1's policy normaliser writes `rawLiteapiResponse`, and its flight modules carry Duffel-era shapes.
- **Deduplication still keys on the raw name.** Normalising the key would collapse "(smoking)" and "(non-smoking)" into one card and keep only the cheaper, removing a choice a guest can currently make. The normalised name titles the card and the variant is surfaced alongside it, so two real offers stay two offers.
- **`pickBaseTitle` has no caller yet.** api-v2 has no room grouping to apply it to — it deduplicates rather than groups — so the rule is ported and tested ahead of the pipeline that will use it. v1 applies it in `mergeGroupsByPhotos`.
- **The LiteAPI-named column stays.** `raw_liteapi_response` is `NOT NULL`, a stored function reads it, and it is already on RDS. Nothing reads it for any decision, so the name is documented rather than migrated.
