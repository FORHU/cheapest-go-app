# Golf Entry Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link the existing `/golf` pages into the storefront — a hero tab, a home-page section, a footer link and a sitemap entry.

**Architecture:** The hero tab is a plain link in `SearchModeToggle`, not a search mode. The home section follows the Deals pattern: an async wrapper in `src/app/(main)/_sections.tsx` queries the database and hands rows to a presentational server component. Spec: `docs/superpowers/specs/2026-10-02-golf-entry-points-design.md`.

**Tech Stack:** Next.js 15 App Router, next-intl, postgres.js, Tailwind v4, Vitest + Testing Library (happy-dom).

---

## File map

| File | Change |
| --- | --- |
| `src/locales/{en,ja,ko,zh}.json` | `landing.search.searchMode.golf`, `footer.golf`, `golf.homeTitle`, `golf.homeSubtitle`, `golf.seeAll` |
| `src/lib/server/golf/courses.ts` | `listNewestPublishedCourses(limit)` |
| `src/lib/server/golf/courses.integration.test.ts` | newest-first test |
| `src/components/golf/GolfCourseCard.tsx` | `titleAs` prop |
| `src/components/golf/GolfCoursesSection.tsx` | new — home-page row |
| `src/components/golf/golf.test.tsx` | section tests |
| `src/app/(main)/_sections.tsx` | `GolfSectionStream` |
| `src/app/(main)/_sections.test.tsx` | new — stream success/failure |
| `src/app/(main)/page.tsx` | place the section after Deals |
| `src/components/landing/hero/SearchModeToggle.tsx` | Golf link tab |
| `src/components/landing/hero/SearchModeToggle.test.tsx` | new |
| `src/components/landing/layout/Footer.tsx` | Golf link |
| `src/app/sitemap.ts`, `src/__tests__/common/sitemap.test.ts` | `/golf` entry + test |

---

### Task 1: Copy

**Files:** Modify `src/locales/en.json`, `ja.json`, `ko.json`, `zh.json`

All four files round-trip exactly through `JSON.stringify(o, null, 2) + '\n'`, so a script edit leaves no formatting noise. `footer` and `searchMode` keys are alphabetical; `golf` keys are in authored order with `amenities` last.

- [ ] **Step 1: Run this script** (save in the scratchpad as `add-golf-copy.cjs`, run with `node add-golf-copy.cjs` from the repo root):

```js
const fs = require('fs');

const copy = {
    en: { tab: 'Golf', homeTitle: 'Golf courses', homeSubtitle: 'Courses we can arrange play at. Ask us about tee times.', seeAll: 'See all golf courses' },
    ja: { tab: 'ゴルフ', homeTitle: 'ゴルフ場', homeSubtitle: 'プレーを手配できるゴルフ場です。ティータイムはお気軽にお問い合わせください。', seeAll: 'すべてのゴルフ場を見る' },
    ko: { tab: '골프', homeTitle: '골프장', homeSubtitle: '라운딩을 예약해 드릴 수 있는 골프장입니다. 티타임은 언제든 문의하세요.', seeAll: '모든 골프장 보기' },
    zh: { tab: '高尔夫', homeTitle: '高尔夫球场', homeSubtitle: '我们可为您安排打球的球场。欢迎咨询开球时间。', seeAll: '查看所有高尔夫球场' },
};

/** Insert at the alphabetical position, leaving the other keys where they are. */
function insertSorted(obj, key, value) {
    const entries = Object.entries(obj).filter(([k]) => k !== key);
    const at = entries.findIndex(([k]) => k.localeCompare(key) > 0);
    entries.splice(at === -1 ? entries.length : at, 0, [key, value]);
    return Object.fromEntries(entries);
}

/** Insert before `before`, or at the end. */
function insertBefore(obj, before, additions) {
    const entries = Object.entries(obj).filter(([k]) => !(k in additions));
    const at = entries.findIndex(([k]) => k === before);
    entries.splice(at === -1 ? entries.length : at, 0, ...Object.entries(additions));
    return Object.fromEntries(entries);
}

for (const [locale, c] of Object.entries(copy)) {
    const file = `src/locales/${locale}.json`;
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    o.landing.search.searchMode = insertSorted(o.landing.search.searchMode, 'golf', c.tab);
    o.footer = insertSorted(o.footer, 'golf', c.tab);
    o.golf = insertBefore(o.golf, 'amenities', { homeTitle: c.homeTitle, homeSubtitle: c.homeSubtitle, seeAll: c.seeAll });
    fs.writeFileSync(file, JSON.stringify(o, null, 2) + '\n');
}
```

- [ ] **Step 2:** `npx vitest run src/locales` → PASS (parity). `git diff --stat src/locales` → 4 files, insertions only.
- [ ] **Step 3: Commit** — `feat(golf): copy for storefront entry points`

---

### Task 2: Newest published courses

**Files:** Modify `src/lib/server/golf/courses.ts`, `src/lib/server/golf/courses.integration.test.ts`

- [ ] **Step 1: Failing test** — add `listNewestPublishedCourses` to the import from `./courses`, then add inside the `describe`:

```ts
    it('lists the newest published courses first, drafts excluded, up to the limit', async () => {
        const older = await make({}, true);
        const newer = await make({}, true);
        await make(); // a draft, newer still
        expect((await listNewestPublishedCourses(2)).map(c => c.id)).toEqual([newer.id, older.id]);
    });
```

- [ ] **Step 2:** With `DATABASE_URL` from `.env`: `npx vitest run src/lib/server/golf` → FAIL (`listNewestPublishedCourses` is not a function).
- [ ] **Step 3: Implement** — in `courses.ts`, directly after `listPublishedCourses`:

```ts
/** The home-page row: newest first, so a course an admin just published shows up there. */
export async function listNewestPublishedCourses(limit: number): Promise<GolfCourse[]> {
    const sql = getSqlAdmin();
    const rows = await sql<GolfCourse[]>`
        SELECT ${columns(sql)} FROM golf_courses
         WHERE status = 'published'
         ORDER BY created_at DESC
         LIMIT ${limit}`;
    return plain(rows);
}
```

- [ ] **Step 4:** Re-run → PASS (6 tests).
- [ ] **Step 5: Commit** — `feat(golf): newest published courses query`

---

### Task 3: Home-page section component

**Files:** Modify `src/components/golf/GolfCourseCard.tsx`, `src/components/golf/golf.test.tsx`; Create `src/components/golf/GolfCoursesSection.tsx`

- [ ] **Step 1: Failing test** — in `golf.test.tsx`, add `import { GolfCoursesSection } from './GolfCoursesSection';` and:

```tsx
describe('GolfCoursesSection', () => {
    it('renders nothing without courses', () => {
        const { container } = render(<GolfCoursesSection courses={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the courses under one heading, with a link to all of them', () => {
        const second = { ...course, id: 'c2', slug: 'manila-southwoods', name: 'Manila Southwoods' };
        render(<GolfCoursesSection courses={[course, second]} />);
        expect(screen.getByRole('heading', { level: 2, name: 'Golf courses' })).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent))
            .toEqual(['Wack Wack East', 'Manila Southwoods']);
        expect(screen.getByRole('link', { name: /see all golf courses/i })).toHaveAttribute('href', '/golf');
    });
});
```

- [ ] **Step 2:** `npx vitest run src/components/golf` → FAIL (module not found).
- [ ] **Step 3: `titleAs` on the card** — in `GolfCourseCard.tsx` change the doc comment, signature and title element:

```tsx
/**
 * One course card. Works as a server or client component. `titleAs` keeps the outline right:
 * `h2` under the /golf page's `h1`, `h3` under the home section's `h2`.
 */
export function GolfCourseCard({ course, titleAs: Title = 'h2' }: { course: GolfCourse; titleAs?: 'h2' | 'h3' }) {
```

```tsx
                <Title className="font-semibold text-slate-900 dark:text-slate-100">{course.name}</Title>
```

- [ ] **Step 4: `GolfCoursesSection.tsx`**

```tsx
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { GolfCourse } from '@/lib/schemas/golf';
import { GolfCourseCard } from './GolfCourseCard';

/**
 * The home page's golf row. Renders nothing when there are no courses, so an empty
 * catalogue leaves no empty heading behind. A swipeable row on phones, a grid from `sm`.
 */
export function GolfCoursesSection({ courses }: { courses: GolfCourse[] }) {
    const t = useTranslations('golf');
    if (courses.length === 0) return null;

    return (
        <section className="w-full py-8 md:py-12">
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
                <div className="mb-5 flex items-end justify-between gap-4">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-1">{t('homeTitle')}</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base">{t('homeSubtitle')}</p>
                    </div>
                    <Link href="/golf"
                        className="flex shrink-0 items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                        {t('seeAll')}
                        <ArrowRight size={14} aria-hidden />
                    </Link>
                </div>
                <div className="-mx-4 grid grid-flow-col auto-cols-[75%] gap-4 overflow-x-auto snap-x snap-mandatory px-4 pb-2 scroll-px-4 *:snap-start
                    sm:mx-0 sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
                    {courses.map(course => <GolfCourseCard key={course.id} course={course} titleAs="h3" />)}
                </div>
            </div>
        </section>
    );
}
```

- [ ] **Step 5:** Re-run → PASS (5 tests).
- [ ] **Step 6: Commit** — `feat(golf): home-page course section`

---

### Task 4: Stream the section on the home page

**Files:** Modify `src/app/(main)/_sections.tsx`, `src/app/(main)/page.tsx`; Create `src/app/(main)/_sections.test.tsx`

- [ ] **Step 1: Failing test** — `_sections.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GolfCourse } from '@/lib/schemas/golf';
import { listNewestPublishedCourses } from '@/lib/server/golf/courses';
import { GolfSectionStream } from './_sections';

vi.mock('@/lib/server/landing/get-landing-data', () => ({ getFlightDeals: vi.fn() }));
vi.mock('@/components/landing/sections', () => ({ DealsSection: () => null }));
vi.mock('@/lib/server/golf/courses', () => ({ listNewestPublishedCourses: vi.fn() }));
vi.mock('@/components/golf/GolfCoursesSection', () => ({ GolfCoursesSection: () => null }));

const listNewest = vi.mocked(listNewestPublishedCourses);

// Braces matter: a function returned from beforeEach runs as teardown, and mockReset returns the mock.
beforeEach(() => { listNewest.mockReset(); });

describe('GolfSectionStream', () => {
    it('hands the four newest courses to the section', async () => {
        const courses = [{ id: 'c1' }] as GolfCourse[];
        listNewest.mockResolvedValue(courses);
        const element = await GolfSectionStream();
        expect(listNewest).toHaveBeenCalledWith(4);
        expect(element?.props).toEqual({ courses });
    });

    it('renders nothing when the query fails, so the home page still renders', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        listNewest.mockRejectedValue(new Error('connection refused'));
        expect(await GolfSectionStream()).toBeNull();
        expect(log).toHaveBeenCalledWith('[Landing] golf_courses error:', 'connection refused');
        log.mockRestore();
    });
});
```

- [ ] **Step 2:** `npx vitest run "src/app/(main)/_sections.test.tsx"` → FAIL (`GolfSectionStream` is not exported).
- [ ] **Step 3: Implement** — in `_sections.tsx` add imports:

```tsx
import { GolfCoursesSection } from "@/components/golf/GolfCoursesSection";
import { listNewestPublishedCourses } from "@/lib/server/golf/courses";
import type { GolfCourse } from "@/lib/schemas/golf";
```

and at the end of the file:

```tsx
/** Up to four golf courses. Nothing when none are published or the query fails. */
export async function GolfSectionStream() {
    let courses: GolfCourse[];
    try {
        courses = await listNewestPublishedCourses(4);
    } catch (error) {
        console.error("[Landing] golf_courses error:", (error as Error).message ?? error);
        return null;
    }
    return <GolfCoursesSection courses={courses} />;
}
```

- [ ] **Step 4:** Re-run → PASS (2 tests).
- [ ] **Step 5: Place it** — in `page.tsx`, import `GolfSectionStream` alongside `DealsSectionStream`, and directly after the Deals `</Suspense>`:

```tsx
          {/* No skeleton: with nothing published the section does not exist */}
          <Suspense fallback={null}>
            <GolfSectionStream />
          </Suspense>
```

- [ ] **Step 6:** `npx tsc --noEmit -p .` → no errors.
- [ ] **Step 7: Commit** — `feat(golf): golf section on the home page`

---

### Task 5: Hero tab

**Files:** Modify `src/components/landing/hero/SearchModeToggle.tsx`; Create `src/components/landing/hero/SearchModeToggle.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import en from '@/locales/en.json';
import SearchModeToggle from './SearchModeToggle';

vi.mock('next-intl', () => ({
    useTranslations: (namespace: string) => (key: string) => {
        let node: any = en;
        for (const part of `${namespace}.${key}`.split('.')) node = node?.[part];
        return typeof node === 'string' ? node : `${namespace}.${key}`;
    },
}));

describe('SearchModeToggle', () => {
    it('offers golf as a link to the course list, between Flights and AI search', () => {
        const { container } = render(<SearchModeToggle mode="hotels" onModeChange={vi.fn()} />);
        expect(screen.getByRole('link', { name: 'Golf' })).toHaveAttribute('href', '/golf');
        const order = [...container.querySelectorAll('a, button')].map(el => el.textContent);
        expect(order).toEqual(['Stays', 'Flights', 'Golf', 'AI Search']);
    });

    it('still switches search modes with the other tabs', () => {
        const onModeChange = vi.fn();
        render(<SearchModeToggle mode="hotels" onModeChange={onModeChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'Flights' }));
        expect(onModeChange).toHaveBeenCalledWith('flights');
    });
});
```

- [ ] **Step 2:** `npx vitest run src/components/landing/hero/SearchModeToggle.test.tsx` → FAIL (no link named Golf).
- [ ] **Step 3: Implement** — replace `SearchModeToggle.tsx`:

```tsx
"use client";

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { BedDouble, Flag, Plane, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

type SearchMode = 'hotels' | 'flights' | 'ai';

interface SearchModeToggleProps {
    mode: SearchMode;
    onModeChange: (mode: SearchMode) => void;
}

/** A mode tab swaps the search box; a link tab goes to a service with no search box (golf). */
type Tab = { label: string; icon: React.ReactNode; mobileIcon: React.ReactNode } &
    ({ kind: 'mode'; id: SearchMode } | { kind: 'link'; id: string; href: string });

const tabClass = 'relative flex items-center gap-1.5 px-3 py-1.5 sm:px-5 sm:py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all duration-300';
const idleClass = 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200';

const SearchModeToggle: React.FC<SearchModeToggleProps> = ({ mode, onModeChange }) => {
    const t = useTranslations('landing.search.searchMode');
    const tabs: Tab[] = [
        { kind: 'mode', id: 'hotels',  label: t('stays'),    icon: <BedDouble size={14} />, mobileIcon: <BedDouble size={12} /> },
        { kind: 'mode', id: 'flights', label: t('flights'),  icon: <Plane size={14} />,     mobileIcon: <Plane size={12} /> },
        { kind: 'link', id: 'golf',    label: t('golf'),     icon: <Flag size={14} />,      mobileIcon: <Flag size={12} />, href: '/golf' },
        { kind: 'mode', id: 'ai',      label: t('aiSearch'), icon: <Sparkles size={14} />,  mobileIcon: <Sparkles size={12} /> },
    ];
    const content = (m: Tab) => (
        <span className="relative z-10 flex items-center gap-1.5">
            <span className="hidden sm:inline">{m.icon}</span>
            <span className="sm:hidden">{m.mobileIcon}</span>
            {m.label}
        </span>
    );
    return (
        <div className="flex justify-center mb-3 md:mb-6 landscape-compact:mb-1">
            <div className="inline-flex bg-white/5 dark:bg-obsidian-surface backdrop-blur-xl rounded-full p-1 border border-alabaster-border dark:border-obsidian-border shadow-sm">
                {tabs.map((m) => m.kind === 'link' ? (
                    <Link key={m.id} href={m.href} className={`${tabClass} ${idleClass} hover:scale-105 active:scale-95`}>
                        {content(m)}
                    </Link>
                ) : (
                    <motion.button
                        key={m.id}
                        onClick={() => onModeChange(m.id)}
                        className={`${tabClass} ${mode === m.id ? 'text-white shadow-md' : idleClass}`}
                        whileHover={{ scale: mode === m.id ? 1 : 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        {mode === m.id && (
                            <motion.div
                                layoutId="searchModeBg"
                                className="absolute inset-0 bg-blue-600 rounded-full"
                                initial={false}
                                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                            />
                        )}
                        {content(m)}
                    </motion.button>
                ))}
            </div>
        </div>
    );
};

export default SearchModeToggle;
```

- [ ] **Step 4:** Re-run → PASS (2 tests).
- [ ] **Step 5: Commit** — `feat(golf): golf tab in the hero`

---

### Task 6: Footer and sitemap

**Files:** Modify `src/components/landing/layout/Footer.tsx`, `src/app/sitemap.ts`, `src/__tests__/common/sitemap.test.ts`

- [ ] **Step 1: Failing test** — in `sitemap.test.ts`, inside `describe('sitemap')`:

```ts
    it('lists the golf course list once per served locale', () => {
        const golf = entries.filter(e => toRoutePath(e.url) === '/golf');
        expect(golf).toHaveLength(servedLocalePaths('/golf').length);
    });
```

- [ ] **Step 2:** `npx vitest run src/__tests__/common/sitemap.test.ts` → FAIL (length 0).
- [ ] **Step 3: Sitemap** — in `sitemap.ts`, after the Deals entry:

```ts
        // ── Golf ────────────────────────────────────────────────────────────────
        // The list only. Course pages live at `/golf/[slug]`, a dynamic route the
        // orphan guard in sitemap.test.ts rejects by design; crawlers reach them here.
        ...localeVariants('/golf', { changeFrequency: 'weekly', priority: 0.7 }),
```

- [ ] **Step 4:** Re-run → PASS (all sitemap tests, including the orphan guard).
- [ ] **Step 5: Footer** — in `Footer.tsx`, after the Hotels link in the Module column:

```tsx
              <a href="/golf" className="text-slate-500 hover:text-indigo-500 transition-colors">{t('golf')}</a>
```

- [ ] **Step 6: Commit** — `feat(golf): footer link and sitemap entry`

---

### Task 7: Verify

- [ ] **Step 1:**

```bash
npx tsc --noEmit -p .
npx vitest run src/components/golf src/components/landing "src/app/(main)/_sections.test.tsx" src/__tests__/common/sitemap.test.ts src/locales
DATABASE_URL=<from .env> npx vitest run src/lib/server/golf
npx eslint src/components/golf src/components/landing/hero/SearchModeToggle.tsx src/components/landing/hero/SearchModeToggle.test.tsx src/components/landing/layout/Footer.tsx "src/app/(main)/_sections.tsx" "src/app/(main)/_sections.test.tsx" "src/app/(main)/page.tsx" src/app/sitemap.ts src/lib/server/golf
```

- [ ] **Step 2: In the browser** (run-cheapest-go-app skill): with at least one published course, screenshot `/` at desktop width and at 360px. Hero shows four tabs on one line; the Golf section appears after Deals; the Golf tab, "See all golf courses" and the footer link open `/golf`. If the tabs overflow at 360px, reduce mobile padding (`px-3` → `px-2.5`, `gap-1.5` → `gap-1`) in `tabClass` and re-check.
- [ ] **Step 3: Commit** any fixes; push `feat/golf-courses`.
