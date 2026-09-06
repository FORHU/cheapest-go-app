# The support inbox ignores the brand switcher

Every list in `/admin` is scoped by the brand switcher — bookings, customers, revenue, saved trips all read `getAdminBrand()` and filter on `source_brand`. The support inbox does not. It shows CheapestGo and GeomeeGo conversations in one queue, with the brand as a column, and the sidebar badge counts both.

This is worth writing down because it looks like an oversight. A future reader comparing `listInbox` with `getCustomersList` will find one obeying the switcher and one ignoring it, conclude the newer one forgot, and add the filter. The filter is the bug.

The difference is what the two kinds of screen are for. A bookings list is a record: you go to it with a question already in mind, and narrowing it to one brand helps you answer that question. A support queue is a signal: its job is to tell you something exists that you did not know about. A record you cannot see is inconvenient. **A signal you cannot see is indistinguishable from silence** — and the failure is invisible, because an empty queue and a filtered-away queue look identical.

The concrete case: GeomeeGo is served by a second EC2 instance ([ADR-0005](0005-geomeego-white-label-deployment.md)), and `getAdminBrand()` defaults to `NEXT_PUBLIC_BRAND_NAME` — this deployment's own brand — not to "all". So an Agent working in the CheapestGo admin with the switcher untouched would never see a Korean customer waiting. They would see an empty queue and reasonably conclude nobody needs help. The customer, meanwhile, has been told someone will join shortly.

Support Hours are one schedule and the queue is one queue; the inbox showing one brand would be the only part of the design that disagreed.

## Considered options

**Never filter by brand; show it as a column (chosen).** One queue, both brands, brand visible per row so an Agent can still tell who they are talking to and answer in the right voice. Filtering remains available as a tab for anyone who wants it — it is the *default* that is dangerous, not the capability.

**Obey the switcher like every other screen.** Rejected, and it is the tempting one: it is consistent, it needs no explanation, and it reuses `applyBrandFilter`. It is rejected because consistency here buys a tidier codebase at the cost of customers waiting unanswered, and the failure mode gives no signal that it is happening.

**Obey the switcher but count both brands in the badge.** Rejected as the worst of the three. A badge reading 3 above a list showing 1 is a contradiction the reader has to decode, and the natural reading — "the badge is buggy" — is wrong in the most damaging direction.

**Give each brand its own inbox and its own Agents.** Rejected as premature. It is the right answer for a team large enough to specialise, and nothing here prevents it: `source_brand` is on every conversation from the first migration. Today there is one small team answering both.

## Consequences

- **An Agent sees Korean conversations in the CheapestGo admin.** That is intended, and it means the inbox needs the brand legible on every row, and — eventually — some help reading a language the Agent may not speak. Neither is solved here.
- **`listInbox` and `inboxCounts` deliberately do not call `getAdminBrand()` or `applyBrandFilter`.** Anything that adds them re-introduces the invisible queue. A test asserts both brands appear in `waiting`.
- **This does not generalise to the rest of admin.** Bookings and customers should keep obeying the switcher. The distinction is signal versus record, not support versus everything else — if another screen is ever added whose job is to surface unknown work, it belongs on this side of the line.
