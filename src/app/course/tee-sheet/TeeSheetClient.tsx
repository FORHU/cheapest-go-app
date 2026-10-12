'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { GolfDatePicker } from '@/components/golf/GolfDatePicker';
import { formatMoney } from '@/components/golf/format';
import type { Impact } from '@/lib/schemas/golfTeeSheet';
import type { TeeSheetOverview } from '@/lib/server/golf/teeSheet';
import { BlockSection } from './BlockSection';
import { ExtrasSection } from './ExtrasSection';
import { ImpactConfirm } from './ImpactConfirm';
import { ScheduleSection } from './ScheduleSection';
import { cardClass, headingClass, hintClass, secondaryButton, type Review } from './shared';

interface Pending { body: Record<string, unknown>; impact: Impact }

/**
 * A course's tee sheet, in the admin's idiom. Every change is asked about first (the server runs
 * it and rolls it back to count what it would do), shown for confirmation, then applied for real
 * and recorded.
 */
export function TeeSheetClient({ sheet, courses }: { sheet: TeeSheetOverview; courses: { id: string; name: string }[] }) {
    const t = useTranslations('golf.staff.sheet');
    const locale = useLocale();
    const router = useRouter();
    const { course } = sheet;

    const [pending, setPending] = useState<Pending | null>(null);
    const [busy, setBusy] = useState(false);
    const [applyError, setApplyError] = useState<string | null>(null);
    const [pageError, setPageError] = useState<string | null>(null);
    const [blockOpenRequest, setBlockOpenRequest] = useState(0);

    const post = async (body: Record<string, unknown>) => {
        const response = await fetch('/api/course/tee-sheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
            body: JSON.stringify({ courseId: course.id, ...body }),
        });
        const json = await response.json().catch(() => ({}));
        return { ok: response.ok, json };
    };

    const review: Review = async (body, options) => {
        setPageError(null);
        try {
            const { ok, json } = await post({ ...body, preview: true });
            if (!ok) {
                const error = json.error ?? t('error');
                if (options?.surface) setPageError(error);
                return { error, fieldErrors: json.fieldErrors };
            }
            setApplyError(null);
            setPending({ body, impact: json.data.impact });
            return {};
        } catch {
            if (options?.surface) setPageError(t('error'));
            return { error: t('error') };
        }
    };

    const apply = async () => {
        if (!pending) return;
        setBusy(true);
        setApplyError(null);
        try {
            const { ok, json } = await post(pending.body);
            if (!ok) {
                setApplyError(json.error ?? t('error'));
                return;
            }
            setPending(null);
            router.refresh();
        } catch {
            setApplyError(t('error'));
        } finally {
            setBusy(false);
        }
    };

    const goTo = (params: { course?: string; date?: string }) => {
        const q = new URLSearchParams({ course: params.course ?? course.id });
        if (params.date) q.set('date', params.date);
        router.push(`/course/tee-sheet?${q}`);
    };

    const stamp = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
    const state = (tt: TeeSheetOverview['day']['teeTimes'][number]) =>
        tt.status === 'open' ? t('stateOpen') : tt.closedBy === 'block' ? t('stateBlocked') : t('stateClosed');
    const stateStyle = (tt: TeeSheetOverview['day']['teeTimes'][number]) =>
        tt.status === 'open'
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
            : tt.closedBy === 'block'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300';

    return (
        <div className="flex flex-col gap-4">
            <header>
                <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    <CalendarRange className="h-5 w-5" /> {t('title')}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">{course.name}</p>
            </header>

            {courses.length > 1 && (
                <nav aria-label={t('courseLabel')} className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-white/10">
                    {courses.map(c => (
                        <Link key={c.id} href={`/course/tee-sheet?course=${c.id}`}
                            aria-current={c.id === course.id ? 'page' : undefined}
                            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${c.id === course.id
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                            {c.name}
                        </Link>
                    ))}
                </nav>
            )}

            {pageError && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{pageError}</p>
            )}

            <section aria-labelledby="sheet-day" className={cardClass}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <h2 id="sheet-day" className={headingClass}>{t('dayTitle')}</h2>
                    <div className="w-48">
                        <GolfDatePicker appearance="boxed" label={t('dayDate')} value={sheet.day.date} today={sheet.day.date}
                            onChange={date => { if (date) goTo({ date }); }} />
                    </div>
                </div>

                {sheet.day.teeTimes.length === 0 ? (
                    <p className={`${hintClass} mt-4`}>{t('dayEmpty')}</p>
                ) : (
                    <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {sheet.day.teeTimes.map(tt => (
                            <li key={tt.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
                                <div>
                                    <p className="font-mono text-base font-medium tabular-nums text-slate-900 dark:text-slate-100">{tt.localTime}</p>
                                    <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                                        {formatMoney(tt.pricePerPlayer, tt.currency, locale)} · {t('spotsLeft', { left: tt.spotsLeft, total: tt.spots })}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-1 text-xs">
                                    <span className={`rounded-full px-2 py-0.5 font-medium ${stateStyle(tt)}`}>{state(tt)}</span>
                                    {tt.booked > 0 && <span className="tabular-nums text-slate-500 dark:text-slate-400">{t('booked', { count: tt.booked })}</span>}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                {course.timezone && (
                    <p className="mt-4">
                        <button type="button" onClick={() => setBlockOpenRequest(n => n + 1)} className={secondaryButton}>{t('blockDay')}</button>
                    </p>
                )}
            </section>

            <ScheduleSection schedules={sheet.schedules} currency={course.currency} hasTimeZone={Boolean(course.timezone)} review={review} />

            <BlockSection blocks={sheet.blocks} hasTimeZone={Boolean(course.timezone)} startDate={sheet.day.date}
                openRequest={blockOpenRequest} review={review} />

            <ExtrasSection key={JSON.stringify(sheet.extras)} extras={sheet.extras} currency={course.currency}
                courseId={course.id} onSaved={() => router.refresh()} />

            <section aria-labelledby="sheet-history" className={cardClass}>
                <h2 id="sheet-history" className={headingClass}>{t('historyTitle')}</h2>
                {sheet.changes.length === 0 ? (
                    <p className={`${hintClass} mt-3`}>{t('historyEmpty')}</p>
                ) : (
                    <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/5">
                        {sheet.changes.map(change => (
                            <li key={change.id} className="py-2.5 text-sm first:pt-0 last:pb-0">
                                <p className="text-slate-900 dark:text-slate-100">{change.summary}</p>
                                <p className="mt-0.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                                    {t('historyBy', { who: change.by ?? '—', date: stamp.format(new Date(change.createdAt)) })}
                                </p>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {pending && (
                <ImpactConfirm impact={pending.impact} busy={busy} error={applyError}
                    onApply={apply} onCancel={() => { setPending(null); setApplyError(null); }} />
            )}
        </div>
    );
}
