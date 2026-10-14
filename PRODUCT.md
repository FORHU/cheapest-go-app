# Product

## Register

product

## Users

Four audiences share one codebase, and every one of them is in a task when they meet the interface.

**Travellers booking flights and hotels.** People shopping in English, Japanese, Korean or Chinese, seeing prices in the currency they choose and paying real money. They are deciding, paying, and later coming back to check, change or cancel. The project is mobile-first, so a phone is the default canvas.

**Golfers booking tee times.** A newer audience with rules of its own: a per-course booking window, a weather rule, a free-cancellation cutoff, and a booking that is requested before it is confirmed.

**Course staff and partners.** People at a golf course who confirm or decline requests, run a tee sheet and keep their course's page current.

**The support and admin team.** Agents and admins who live in dense back-office consoles all day. Those consoles are English by design and must be fast and fully keyboard operable.

The primary job on any traveller screen is one of: find it, compare it, pay for it, or manage what was already bought. The primary job on a staff screen is to act on the queue in front of them.

## Product Purpose

CheapestGo (and its white-label Korean storefront AirangGo) sells flights, hotels and golf as the seller, not as a referrer. It exists so that booking travel is not adversarial: prices are real, what is charged is exact, and a booking is safe once it is made.

Success is a traveller who finishes a screen certain that they are booked and that it is safe: they know the state of every booking in plain words, what happens next, and what they can do about it.

## Brand Personality

Trustworthy and exact. Efficient. Reassuring. With a sharp, unhyped sense of value as a supporting trait.

The voice is plain and specific: it states the fact and the next step, in sentence case, and never shouts. It is a capable agent who is calm when money or plans are in motion: precise about amounts, honest about what is pending, and never theatrical about a deal.

## Anti-references

- **Budget-airline chaos:** banners, countdown timers, add-on noise and shouting colour competing for attention.
- **Dark patterns:** hidden fees, pre-ticked extras, fake urgency, or any price that changes late without saying so.
- **The generic SaaS dashboard:** gradients, glass cards, hero metrics and decorative charts that say nothing.
- **Luxury travel editorial:** hushed serif spreads and generous emptiness; lovely, but this is a tool people act in.

Reference products for the right feel: **Stripe** (money shown precisely and calmly, careful status states), **Linear** (fast, quiet, dense without feeling cramped, strong focus behaviour), **Wise** (plain-language transparency about what a payment costs and where it stands, across currencies), and **Booking.com and Airbnb** (travel-native conventions people already know: result cards, trip lists, itineraries).

## Design Principles

1. **Say where it stands.** Every booking, payment and refund names its state in words and what happens next. Nothing is pending, requested or failed without an explanation, and no state is shown by colour alone.
2. **State money exactly, and never stage it.** Amounts are precise, in the currency actually being charged, and set in the numeric face. A price that has moved says so before a card is touched.
3. **The task is the interface.** Familiar patterns over invention; one primary action per screen or card, with secondary actions stepping back. Design serves the booking, then disappears.
4. **One system for every kind of booking.** A hotel, a flight and a tee time are bookings first. They share a frame, a vocabulary and a status language, and a type is told by its icon and its word, not by a hue of its own.
5. **Every language is a first language.** English, Japanese, Korean and Chinese are complete in the funnel: dates, times and currency follow the reader's conventions, type stays legible in CJK, and English never leaks into a translated screen.

## Accessibility & Inclusion

- **WCAG 2.2 AA** is the floor on every screen: contrast, visible focus, 44px-class targets and keyboard operability.
- **Keyboard-first back office:** admin, the support desk and the course portal work fully by keyboard, with visible focus and proper tab semantics.
- **Colour is never the only signal:** status, refunds and price changes always carry words or an icon as well as a tint.
- **CJK legibility and 200% zoom:** Japanese, Korean and Chinese text stays readable at small sizes (chips and labels step up a size), and layouts survive 200% zoom without clipping.
- **Reduced motion is respected:** pulses, springs and transitions step aside when the system asks for less motion.
