# Revenue is reported in USD at a rate locked when payment is taken

CheapestGo charges customers in up to 18 currencies, so any blended revenue figure needs one denomination and one moment at which the conversion happens. We report in **USD** (FORHU Inc is the booking entity and suppliers quote predominantly in USD), and we convert **once, when the payment is taken**, storing the dollar amount alongside the rate used and the instant it was captured. A period once closed therefore returns the same figure however long afterwards the report is run, and a refund reverses at the booking's own locked rate so a cancelled booking nets to exactly zero.

## Considered Options

- **Lock at payment, store the rate (chosen)** — reports are reproducible, two people running the same query agree, and the numbers survive a rate-provider outage because nothing is recomputed at read time. Costs three columns per booking and a one-time backfill.
- **Convert on read at today's rate** — rejected. It needs no schema change and no backfill, which is its whole appeal, but last month's revenue then changes every day, no report can be reproduced, and the dashboard cannot render at all while the rate provider is down. It also makes a refund appear as a gain or loss purely because time passed, which would have to be explained away with an FX line that describes nothing real.
- **Report per-currency only, no blended total** — rejected. Honest and requires no FX policy at all, but it removes "total revenue" as a single number, which is the figure the business actually wants.

## Consequences

- Three fields travel with every booking: the dollar amount, the rate, and when it was captured. The rate is evidence, not a cache — it is never recalculated.
- A rate that was not recorded at the time cannot be recovered later, so this is effectively irreversible. Existing rows are backfilled from ECB historical rates by booking date; VND, TWD and AED have no ECB history and are marked estimated rather than silently guessed.
- By the time the rate is locked the money has already moved through Stripe, so a rate outage must never block the booking. Such rows record a null rate and are reconciled afterwards.
- This supersedes the two-currency assumption in `get_revenue_stats`, which valued every non-USD booking as though it were PHP — counting a ₩500,000 booking as ₱500,000. Its `revenueByCurrency` breakdown was always correct and becomes the basis for the restated figures.
- "Total Profit" is retired as a reported figure. Markup is sized to break even on Stripe fees (see `src/lib/pricing.ts`), so the platform reports **Gross Booking Value** and **Net Revenue** instead.
