# ADR 0041 — A destination is chosen by name, never by the supplier's hierarchy

**Date:** 2026-10-29
**Status:** Accepted

## Context

A searched place is turned into a supplier **Destination Code**, cached in `tgx_destination_cache`,
and every hotel search is asked in terms of it. Two things wrote that table and they disagreed.

`resolveTgxDestinationCode` preferred a `ZONE` over a `CITY` whenever the country was known, on the
reasoning that "geographic zones (islands, provinces) are rarely shared across countries". The
nightly `sync-dest-cache` preferred a `CITY` over a `ZONE` and, among candidates of one type, kept
whichever the supplier paged first. Both wrote with `ON CONFLICT DO UPDATE`, so a destination meant
whatever the last writer thought and silently changed meaning when the other ran. Neither recorded
when or by whom a row was written: the sync's upsert never touched `created_at`, so `jeju:kr` read
`2026-09-09` while holding a value written long after.

Each preference has produced a wrong answer in production. ZONE-first sent "Paris, France" to
Alpine-Casparis Municipal Airport — not because a zone was wrong, but because the selection fell
back to *any* zone when none matched the name. Asked for "Jeju", `destinationSearcher` returns two
places, the city code `850` and Jeju International Airport, so the same rule would pick the airport;
`tgx_destination_cache` still carries the row it wrote for it.

The obvious repair is to climb the supplier's hierarchy — ask for the island rather than a city on
it. TGX does model Jeju that way: a zone `6049718` with `Jeju City` and `Seogwipo City` beneath it.
Measured against the portfolio endpoint on this access, those three destinations return **one hotel
each**, while the flat city code `850` returns four hundred spread across the whole island. The
hierarchy is real geography and says nothing about inventory.

## Decision

Selection consults the name and nothing else, in one function both writers call.

- **A candidate the query does not name is never selected** — not as a fallback, not as a last
  resort. "Related" means the name equals the query or continues it at a word boundary, which is
  what separates `Paris` from `Alpine-Casparis`.
- **Then an exact name match, then the lowest code.** A total order, so an answer never depends on
  the order the supplier happened to return things in.
- **The supplier's type label is not consulted at all**, so a relabelled destination cannot move a
  search.
- **The hierarchy is stored and not trusted.** `parent_code` is recorded because it identifies a
  destination's country and is worth having; it does not influence which code is chosen.
- **Coverage stays the arbiter of whether an answer is good**, where it can be measured:
  `isThinDestinationAnswer` compares what a code returned against what the catalog holds, at search
  time, when a real count exists. Selection cannot know that without asking, so selection does not
  guess at it.
- **The live resolver fills gaps; it does not correct the catalog.** `destinationSearcher` answers
  from a narrower set than the bulk `destinations` list — two candidates for Jeju against four — so
  it may write a row that has none and may clear a `NONE` Sentinel, but never overwrites a real
  code.
- **A code a person repaired is final.** Rows carry `source`, and the sync leaves `manual` alone.

## Considered Options

**Prefer the broadest related destination.** Written, tested, and withdrawn before it shipped: it
resolves Jeju to a destination holding one hotel instead of four hundred. Kept here because the
reasoning is seductive and the refutation is not obvious without asking the supplier.

**Rank candidates by portfolio coverage at selection time.** The only signal that would be right in
every case, and it costs a portfolio call per candidate on a path whose whole purpose is to avoid an
18-second round trip. The coverage check we already run at search time gets the same protection for
free, after the fact.

**Keep two rules and make them agree by convention.** Rejected: that is what the two call sites
already believed they were doing.

## Consequences

- **"Jeju" resolves to `850`, which is what it resolved to before this change.** The value of the
  change is that it can no longer become the airport, and can no longer change by itself.
- **A name the supplier does not carry now resolves to nothing rather than to something nearby.**
  The caller falls back to the **Hotel-Code Fallback**, which is the honest answer and was always
  the intended one.
- **The sync can still correct a wrong code**, because machines may overwrite each other; only a
  `manual` row is protected.
- **`created_at` stops being evidence of anything** and `updated_at` starts being. Existing rows
  carry no `source`, and are read as the sync's own so the first run after this corrects them
  exactly as it would have before.
- **This does not explain why a Jeju search returned few hotels on the northern half of the
  island.** Destination `850` demonstrably contains them, and answered with them: 110 hotels,
  94 of them northern, for the weekend in question. They were dropped after selection, by the
  thin-answer check discarding that result against a 960-row catalog — fixed separately, by
  keeping the discarded answer and comparing it with what the fallback actually returned.
