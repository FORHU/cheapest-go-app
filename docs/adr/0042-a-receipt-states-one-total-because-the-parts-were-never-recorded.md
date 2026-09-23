# A receipt states one total, because the parts were never recorded

A **Receipt** shows a single "Total Paid", says in words that it includes all taxes and fees, and names a discount when a voucher was applied. It carries no breakdown of room rate against tax, and no line for **Platform Cost**. This is written down because the obvious objection — that every comparable storefront itemises, and the figures are sitting in the table — is correct about the storefronts and wrong about the figures.

The work began as "add the detail OTAs show", and an itemised total is the first thing on that list. Three attempts at one failed on the data rather than on policy.

**No tax figure is recorded anywhere, though the supplier sends one.** Duffel returns `base_amount` and `tax_amount` on every offer, and `FlightPrice` carries `base` and `taxes` fields all the way through to the `booking_sessions.flight` document. Nothing ever fills them: `normalizeFlightOffer` reads `base: nf.baseFare ?? nf.base ?? 0` and `taxes: nf.taxes ?? 0`, and no flight code path parses Duffel's amounts — the only place in this codebase that reads `tax_amount` is the Duffel *Stays* provider. So both fields arrive as zero and are stored as zero.

The consequence is that the figures cannot be recovered for a booking already taken. A line labelled "Taxes and fees", computed as `charged_price − supplier_cost`, would contain no tax at all — it would be the platform fee wearing a tax label, on a document expense departments file and reclaim against.

On the hotel side the gap has the same shape: `hotel_prebook_quotes.gross` is documented as *"Supplier total including taxes"*, so tax arrives already blended, and the `surcharges` TGX returns at prebook — each with a charge type and a mandatory flag — are shown at checkout and then discarded rather than persisted.

**The two figures are not in the same currency.** For hotels `supplier_cost` holds whatever TGX returned, which `TGX_TARGET_CURRENCY` pins to USD, while `charged_price` and `currency` are the traveller's **Charge Currency**. Printing them as adjacent lines repeats a mistake this codebase has already made once: the OTV credit alert compared a 600,000 PHP credit line against a USD sum, read it as $600,000, and could never fire — the only warning before OTV silently auto-cancels refundable bookings at their deadline. The same subtraction on a receipt renders as a 54× markup in front of the customer.

**On flights the two columns do not mean what their names suggest.** `create-booking.ts` writes `charged_price` from the Duffel-confirmed order total and `supplier_cost` from the session's original price, and does not write `markup_pct` on that path at all. Both are supplier-side figures, so a breakdown would show two nearly equal numbers, neither of which is the amount Stripe took.

So the receipt says the one thing that is true and verifiable: this is what was paid, and it includes everything.

## Considered options

- **One total, stated as inclusive (chosen)** — nothing printed that cannot be stood behind.
- **A blended "Taxes and fees" line** — the convention travellers read, and here it would be a fee-only line under a tax label. Rejected as false, not merely imprecise.
- **Supplier total beside total paid** — honest labels, and it reverses [ADR-0036](0036-the-markup-is-flat-plus-proportional-because-platform-cost-is.md) in effect since the fee becomes a subtraction. Chosen at first and abandoned once the currency mismatch surfaced; it cannot be built correctly for hotels at all.
- **Deriving tax from a known rate** — rejected outright. A printed tax figure that was reverse-engineered rather than billed is acted on by finance teams and asked about by auditors.

## Consequences

- **The receipt still cannot support a tax reclaim, and now says so by omission.** That is a real gap for the expense-department audience the glossary names, and it is not closed by this decision.
- **A real breakdown is a data project, not a rendering one — but a small one.** The fields already exist on `FlightPrice` and the session's `flight` document is `jsonb`, so capturing Duffel's `base_amount` and `tax_amount` needs a parsing change and no migration. What it cannot do is reach backwards: every booking taken before that change has zeros, so the rows appear for new bookings and stay absent for old ones, and the receipt has to handle both. Hotels need the TGX `surcharges` persisted at prebook, which is a column. The supplier-currency problem is separate and still unsolved.
- **An open question is left behind deliberately.** Because `charged_price` on flights is written from the confirmed order total, "Total Paid" may be printing a pre-markup figure. This was noticed while reading the insert, not confirmed against a real Stripe charge, and it is worth more than the detail this work set out to add.
- **The unverified trading-name line comes off.** `InvoicePdfDocument` printed "is a trading name of CheapestGo Travel Services" above a FIXME saying that company appears nowhere else and the real entity is FORHU Inc. No issuer detail replaces it until someone confirms what is registered, so the receipt names no entity at all.
- **Only non-personal fields were added.** [ADR-0027](0027-authorisation-belongs-to-the-resource-not-the-page.md) records that this page's credential is thin for flights; cancellation terms and a discount line help a traveller without helping a stranger act on the booking, and anything that would wait behind the `receipt_token` work.
- **The web page and the PDF gain fields together.** They drifted once already, which is how the unverified claim survived. Both now also carry the same layout, so the document a traveller reads and the one they download are recognisably one thing.
- **The shipped receipt is deliberately not the Figma.** The design draws **Fare**, **Taxes**, **Restriction Endorsements** and **Fare Calculation**; all four are laid out but never rendered. The first two have no data for the reasons above. The last two come from `mystifly-ticket-display`, and Mystifly is not live — its routes answer 503 — so on a Duffel booking there is nothing to call. The design marks each of them "Placeholder (fetch value)", which is the designer recording the same gap. Each row returns the day its data does; a blank label or a zero would read as a fact.
- **Two figures in the design were wrong and are not reproduced.** It shows a form of payment of "Cash" on a product that only ever charges a card through Stripe, and an issuing airline of "Clark International Airport", which is an airport. The receipt prints the real payment method and the marketing carrier from the first segment.
- **The contact number the design carries is not printed.** [ADR-0027](0027-authorisation-belongs-to-the-resource-not-the-page.md) already records this page's credential as thin for flights, where it renders a name, a PNR and an e-ticket number; a phone number completes the set an airline asks for to verify a caller. It waits for the `receipt_token` work.
- **Hotels share the flight layout.** They keep the same structure with type-correct labels — Guest rather than Passenger, Booking Reference rather than PNR, Property rather than Issuing Airline — so one document serves both rather than a second design being invented.
