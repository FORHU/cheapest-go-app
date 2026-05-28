# Design System: CheapestGo

## 1. Visual Theme & Atmosphere

A confident, deal-forward travel interface — the feel of a sharp-eyed travel agent who always finds the best price. Not luxury, not budget-airline chaos: it sits at the exact intersection of **trustworthy and efficient**. Think Bloomberg Terminal clarity meets a well-lit airport business lounge.

- **Density:** 5/10 — Daily App Balanced. Search results, flight cards, and hotel listings need breathing room, but the app must show meaningful data without excessive scrolling.
- **Variance:** 7/10 — Offset Asymmetric. Hero and landing use asymmetric split layouts. Booking flows tighten to predictable structure for trust.
- **Motion:** 5/10 — Fluid CSS. Smooth spring transitions for state changes and card reveals. No cinematic excess — users are here to book, not watch an animation reel.

The light mode is **frost-glass clean** — white surfaces with subtle blue-tinted shadows. The dark mode is **deep obsidian** — near-black canvas with low-opacity glass cards. Both modes feel premium without trying.

---

## 2. Color Palette & Roles

- **Canvas Frost** (`#F8FAFC`) — Primary page background surface. Slate-50. Never pure white.
- **Pure Surface** (`#FFFFFF`) — Card interiors, modal backgrounds, input fills.
- **Obsidian** (`#020617`) — Dark mode canvas. Slate-950-adjacent. Never pure black.
- **Slate Ink** (`#0F172A`) — Primary text. Slate-950. Used for headings, labels, prices.
- **Steel** (`#475569`) — Secondary text. Descriptions, flight metadata, helper copy.
- **Ash** (`#94A3B8`) — Muted tertiary. Timestamps, footnotes, placeholder text.
- **Whisper Border** (`rgba(226, 232, 240, 0.6)`) — Card borders, row dividers, structural 1px lines.
- **Glass Surface Light** (`rgba(255, 255, 255, 0.70)`) — Frosted glass card fill. Paired with `backdrop-blur-xl`.
- **Glass Surface Dark** (`rgba(255, 255, 255, 0.04)`) — Dark mode frosted card fill.
- **Route Blue** (`#2563EB`) — **Single accent.** CTAs, active nav states, price highlights, focus rings. Blue-600. All interactive surfaces resolve to this.
- **Sky Blue** (`#3B82F6`) — Hover state of Route Blue. Slightly lighter for pressed/hover feedback.
- **Deep Navy** (`#1D4ED8`) — Active pressed state of Route Blue. Used for icon backgrounds and dark blue surfaces.
- **Price Green** (`#16A34A`) — Positive price delta only. "Cheapest" badges, savings indicators. Used sparingly.
- **Alert Rose** (`#E11D48`) — Error states, price increase indicators, destructive actions only.

**Banned:** No purple. No cyan glow. No neon gradients. Saturation ceiling: 70% on accent. No warm gray — the neutral is exclusively Slate (cool-gray).

---

## 3. Typography Rules

- **Display / Headlines:** `Outfit` — Track-tight (`letter-spacing: -0.03em`). Weight 700–800 for hero headlines, 600 for section headers. Hierarchy through weight + color contrast, never just size alone. Scale via `clamp()` — no breakpoint jumps.
- **Body:** `Outfit` — Weight 400. Leading `1.65`. Max `65ch` line length. Color: Steel (`#475569`) for descriptions, Slate Ink for primary content.
- **UI Labels & Metadata:** `Outfit` — Weight 500–600. `text-[11px] uppercase tracking-[0.12em]` for table headers, badge text, and section labels. Never generic `font-bold` alone.
- **Mono / Prices / Numbers:** `JetBrains Mono` — All currency amounts, flight times, durations, dates. Tabular figures only. This is non-negotiable for price comparison readability.

**Banned fonts:** `Inter` as primary body font — too generic. `Times New Roman`, `Georgia`, `Palatino`, `Garamond`. No serif anywhere — this is a booking app, not an editorial magazine.

**Font upgrade path:** Replace current `--font-sans: Inter` with `Outfit`. Keep `Inter Tight` as `--font-display` only for the wordmark/logo. Keep `JetBrains Mono` for all numeric data.

---

## 4. App Icon Spec

The app icon must read at 44×44px and look indistinguishable from a top-tier OTA on a home screen grid alongside Booking.com and Expedia.

**Approach — Wordmark Lettermark:**
- Solid **Deep Navy** (`#1D4ED8`) square background. No gradient. No glow.
- White **"CG"** ligature centered. Tight kerning, custom-feeling letterforms. The C and G share a stroke or overlap slightly — not two separate letters floating apart.
- Font weight 800–900. `Outfit Black` or `Cabinet Grotesk ExtraBold`.
- Optionally: a single thin white horizontal line (flight path) crossing the lettermark diagonally — subtle, not illustrated.
- No airplane silhouette. No globe. No paper plane. No photographic content.

**Approach — Minimal Mark (alternative):**
- Deep Navy background.
- White abstract "price tag" or "route arc" — a single clean path, not a clipart illustration.
- The mark should be geometric enough to feel designed, not generated.

**Icon must NOT contain:** airplane photos, blurry raster images, multiple colors, gradients, drop shadows on the mark itself, text longer than 2 characters.

---

## 5. Component Stylings

**Buttons**
- Primary: `bg-[#2563EB]` fill, white text, `rounded-xl` (14px). Active state: `translateY(-1px)` + slight shadow deepen. No outer glow. No neon ring.
- Secondary/Ghost: `border border-slate-200` + `bg-white` or transparent. Text: Slate Ink.
- Destructive: `bg-[#E11D48]`. Only for irreversible actions.
- Height: `44px` minimum (touch target compliance). `h-11` standard, `h-12` large CTA.
- Disabled: `opacity-40`. Never hide disabled buttons — show them as inactive.

**Cards**
- Border radius: `rounded-2xl` (18px). Generous, modern, not bubble-round.
- Fill: `bg-white/70 backdrop-blur-xl` (light) / `bg-white/[0.04] backdrop-blur-xl` (dark).
- Border: `1px solid rgba(226,232,240,0.6)` (light) / `1px solid rgba(255,255,255,0.08)` (dark).
- Shadow: `0 20px 25px -5px rgba(0,0,0,0.05)` (light) / `0 20px 25px -5px rgba(0,0,0,0.2)` (dark).
- Shadow tint: on blue-heavy pages, tint shadow with `rgba(37,99,235,0.08)`.
- Flight result cards: use `border-l-4 border-l-[#2563EB]` to add Route Blue left accent.
- No stacked cards. No cards inside cards. Cards are top-level containers only.
- High-density list views: replace cards with `border-b border-slate-100` row dividers + negative space.

**Search Module / Hero Input**
- Container: `bg-white/60 backdrop-blur-3xl rounded-2xl border border-white/20 shadow-2xl`.
- Dark: `bg-[#0F172A]/80 border-white/10`.
- Input rows: `h-16` minimum. `rounded-lg` inputs within a `rounded-2xl` container.
- All prices: `font-mono font-semibold text-[#0F172A]`.
- Search CTA button: full Route Blue, `rounded-xl`, `h-12`, `font-semibold`.

**Inputs / Forms**
- Label: always above the input, never floating.
- Height: `h-11` standard.
- Border: `border-slate-200 dark:border-white/10`.
- Focus ring: `ring-2 ring-[#2563EB]/20 border-[#2563EB]`.
- Error: `border-[#E11D48] ring-[#E11D48]/20`. Error text below in Alert Rose, `text-xs`.
- No floating labels. No placeholder-as-label.

**Badges / Tags**
- Shape: `rounded-full`. Compact. `px-2.5 py-0.5`.
- Text: `text-[10px] font-black uppercase tracking-[0.12em]`.
- "Cheapest" badge: `bg-[#16A34A]/10 text-[#16A34A]`. Never use green for anything else.
- "Sold Out" / "Limited": `bg-[#E11D48]/10 text-[#E11D48]`.
- Airline/provider name tags: `bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300`.

**Price Display**
- All prices: `font-mono`. Non-negotiable. Tabular figures for alignment.
- Main price: `text-2xl font-bold text-[#0F172A]`.
- Currency symbol: `text-sm font-medium` — smaller than the number, superscript-adjacent.
- Savings/discount: `text-[#16A34A] font-semibold font-mono`.
- Strikethrough original price: `line-through text-slate-400 font-mono`.

**Loading States**
- Skeletal loaders that match the exact dimension and shape of the content they replace.
- Flight card skeleton: exact same `h-` as flight card, with shimmer-animated rectangles.
- No circular spinners. No full-page loaders. Incremental skeleton reveal only.
- Shimmer: `bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 bg-[length:400%_100%] animate-[shimmer_1.5s_ease_infinite]`.

**Empty States**
- Composed illustration: a simple SVG scene (not clipart) suggesting "no flights found" or "search to begin".
- Body copy: concise, specific. "No flights match your dates — try shifting by ±1 day."
- CTA: one action button to adjust search parameters.
- Never just "No results." text with no context.

---

## 6. Hero Section Rules

- Layout: **Left-aligned asymmetric split** — headline and CTA on the left third, contextual visual (destination imagery or live data) on the right two-thirds.
- Centered hero: BANNED. This is a utility app, not a marketing brochure.
- Headline technique: Inline destination photos between words — small `40px` circular images (`object-cover rounded-full`) embedded directly inside the headline line. Example: "Fly to [🏔️ Baguio] for ₱1,240". Images are visual punctuation, not decoration.
- On mobile: inline images stack below headline text. Never overlap.
- CTA: one primary Search button. No secondary "Learn more" or "See how it works" links below it.
- No bouncing scroll arrows. No "Scroll to explore" text. No chevron animations.
- Background: subtle `40px` grid texture (`bg-grid-alabaster`) over `#F8FAFC`. On dark: `bg-grid-obsidian` over `#020617`.

---

## 7. Layout Principles

- **Grid-first:** CSS Grid for all multi-column layouts. No `calc()` percentage math. No Flexbox tricks for equal-width columns.
- **Max-width:** `max-w-7xl` (1280px) for content, `max-w-[1400px]` for full-width sections. Always `mx-auto`.
- **Full-height sections:** `min-h-[100dvh]` only. Never `h-screen` — iOS Safari viewport bug.
- **Section spacing:** `clamp(3rem, 8vw, 6rem)` for vertical section gaps. Consistent rhythm.
- **Search results layout:** Single column on mobile. Two-column split (filters left, results right) at `md:` breakpoint. Never 3-equal-columns.
- **Flight/Hotel cards:** Vertical stack list, not a card grid. Grid is for destinations/inspiration sections only.
- **No overlapping elements:** Every element occupies a clean spatial zone. No `absolute` content stacking on top of other content unless it's a tooltip or dropdown.
- **Asymmetric grid** for inspiration/explore sections: 1 large card + 2 small cards, or horizontal scroll strip. Never 3 equal cards side by side.

---

## 8. Responsive Rules

- **Mobile-first.** All multi-column layouts collapse to single column below `768px`. No exceptions.
- **No horizontal scroll** on mobile. Critical failure if content bleeds viewport edge.
- **Touch targets:** All interactive elements minimum `44×44px`. Buttons, links, tab items.
- **Typography:** Headlines via `clamp()`. Body minimum `1rem` / `16px`. Never smaller.
- **Search module:** Stacks vertically on mobile. Full-width inputs. Search button full-width below inputs.
- **Navigation:** Desktop horizontal nav collapses to bottom tab bar on mobile (not a hamburger — this is an app, not a website).
- **Inline images in headlines:** Stack below headline on mobile. Never overlap text.
- **Filter sidebar:** Becomes a bottom sheet modal on mobile. Never a sticky sidebar below `md:`.
- **Price tables:** Horizontal scroll on mobile with sticky first column (route name/airline). Never clip or hide columns.

---

## 9. Motion & Interaction

- **Spring physics default:** `stiffness: 120, damping: 22` — weighty, confident feel. No linear or ease-in easing for UI elements.
- **Page transitions:** `opacity 0→1` + `translateY(8px→0)` on mount. Duration `200ms cubic-bezier(0.25, 0.1, 0.25, 1)`.
- **Staggered card reveals:** Flight/hotel cards cascade into view with `50ms` stagger delay. Never all appear simultaneously.
- **Price update animation:** When prices refresh, numbers animate via counter roll (`font-mono` ensures no layout shift during counter).
- **Perpetual micro-interactions:**
  - Active search button: subtle pulse on the icon `scale(1.0→1.05)` infinite loop.
  - "Cheapest" badge: slow shimmer across the green badge surface.
  - Loading price fetch: skeleton shimmer on exact card dimensions.
- **Hardware-accelerated only:** Animate exclusively `transform` and `opacity`. Never `top`, `left`, `width`, `height`, `margin`, `padding`.
- **Backdrop blur transitions:** `backdrop-filter 800ms ease` for theme switches.
- **No spring bounce on modals or dropdowns** — these should open with `ease-out`, close with `ease-in`. Spring is for interactive drag/swipe elements only.

---

## 10. Anti-Patterns (Banned)

**Typography:**
- No `Inter` as primary body font — upgrade to `Outfit`
- No generic serif (`Times New Roman`, `Georgia`, `Garamond`, `Palatino`)
- No all-caps body text beyond `10–11px` label badges

**Color:**
- No pure black `#000000` — use `#020617` (Obsidian) or `#0F172A` (Slate Ink)
- No neon outer glows (`box-shadow: 0 0 20px rgba(...)`) on buttons or cards
- No purple anywhere in the product
- No oversaturated accents above 70% saturation
- No gradient text on headlines larger than `2xl` — it becomes unreadable

**Layout:**
- No 3-equal-card horizontal grids — use asymmetric or stacked list
- No centered hero layout — left-aligned or split-screen only
- No overlapping elements — every element in its own clean spatial zone
- No `h-screen` — always `min-h-[100dvh]`
- No `calc()` percentage math for columns

**Content:**
- No AI copywriting clichés: "Elevate", "Seamless", "Unleash", "Next-Gen", "Cutting-edge", "Revolutionize"
- No fake round numbers: `99.99%`, `50%`, `10,000+ flights`
- No generic placeholder names: "John Doe", "Jane Smith", "Acme Airlines"
- No filler UI text: "Scroll to explore", "Swipe down", bouncing scroll chevrons
- No emojis in UI copy, labels, or buttons

**Images & Media:**
- No broken Unsplash links — use `picsum.photos/seed/[keyword]/[w]/[h]` for placeholders
- No AI-generated faces — use `ui-avatars.com` or initials-based avatars
- No stock photo airplane cabins — use destination skyline/landmark imagery

**Icons:**
- No app icon with photographic content (blurry airplane photos)
- No paper-plane icon — that's Telegram's trademark
- No hand-coded SVG airplane paths as the primary brand mark
- The app icon must be a clean lettermark (`CG`) or designed abstract mark on solid Deep Navy

**Interactions:**
- No custom mouse cursors
- No horizontal scroll on mobile (except explicitly designed scroll strips)
- No circular loading spinners — skeletal loaders only
- No full-page loading overlays — incremental skeleton loading

---

## 11. Dark Mode Rules

- Canvas: `#020617` (Obsidian). Not Tailwind's `slate-900` — this is darker.
- Cards: `rgba(255,255,255,0.04)` with `backdrop-blur-xl`. Subtle glass, not opaque dark blocks.
- Borders: `rgba(255,255,255,0.08)` — barely visible, structural only.
- Text: `#F8FAFC` primary, `#94A3B8` secondary, `#475569` muted.
- Route Blue accent lightens to `#3B82F6` (Sky Blue) in dark mode for contrast compliance.
- Shadows: `rgba(0,0,0,0.4)` — deeper than light mode. Dark mode needs stronger shadow to communicate elevation.
- All `backdrop-blur` values stay identical between light and dark — glass effect is the shared design language.
