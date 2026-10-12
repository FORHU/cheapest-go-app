'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { GolfDatePicker } from '@/components/golf/GolfDatePicker';
import { formatMoney } from '@/components/golf/format';
import type { Impact } from '@/lib/schemas/golfTeeSheet';
import type { TeeSheetOverview } from '@/lib/server/golf/teeSheet';
import { BlockSection } from './BlockSection';
import { ExtrasSection } from './ExtrasSection';
import { ImpactConfirm } from './ImpactConfirm';
import { ScheduleSection } from './ScheduleSection';
import { secondaryButton, type Review } from './shared';

interface Pending { body: Record<string, unknown>; impact: Impact }

/**
 * A course's tee sheet. Every change is asked about first (the server runs it and rolls it back
 * to count what it would do), shown for confirmation, then applied for real and recorded.
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

    return (
        <div className="mx-auto flex max-w-4xl flex-col gap-12 px-4 pb-24 pt-10">
            <header>
                <h1 className="font-golf text-4xl font-extrabold leading-tight tracking-tight text-g-ink md:text-5xl">{t('title')}</h1>
                {courses.length > 1 ? (
                    <nav aria-label={t('courseLabel')} className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                        {courses.map(c => (
                            <Link key={c.id} href={`/course/tee-sheet?course=${c.id}`}
                                aria-current={c.id === course.id ? 'page' : undefined}
                                className={`border-b-2 pb-1 text-sm transition-colors ${c.id === course.id
                                    ? 'border-g-accent font-semibold text-g-ink'
                                    : 'border-transparent text-g-muted hover:text-g-ink'}`}>
                                {c.name}
                            </Link>
                        ))}
                    </nav>
                ) : (
                    <p className="mt-3 text-g-muted">{course.name}</p>
                )}
                {pageError && <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{pageError}</p>}
            </header>

            <section aria-labelledby="sheet-day">
                <div className="flex flex-wrap items-end justify-between gap-4 border-t border-g-ink pt-4">
                    <h2 id="sheet-day" className="font-golf text-2xl font-bold tracking-tight">{t('dayTitle')}</h2>
                    <div className="w-48">
                        <GolfDatePicker label={t('dayDate')} value={sheet.day.date} today={sheet.day.date}
                            onChange={date => { if (date) goTo({ date }); }} />
                    </div>
                </div>

                {sheet.day.teeTimes.length === 0 ? (
                    <p className="mt-4 text-sm text-g-muted">{t('dayEmpty')}</p>
                ) : (
                    <ul className="mt-4 border-t border-g-rule sm:columns-2 sm:gap-x-10">
                        {sheet.day.teeTimes.map(tt => (
                            <li key={tt.id} className="flex break-inside-avoid items-center justify-between gap-3 border-b border-g-rule py-3">
                                <div>
                                    <p className="font-mono text-lg font-medium tabular-nums text-g-ink">{tt.localTime}</p>
                                    <p className="text-xs tabular-nums text-g-muted">
                                        {formatMoney(tt.pricePerPlayer, tt.currency, locale)} · {t('spotsLeft', { left: tt.spotsLeft, total: tt.spots })}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-1 text-xs">
                                    <span className={`rounded-sm px-2 py-0.5 font-medium ${tt.status === 'open'
                                        ? 'text-g-accent'
                                        : 'bg-g-sunk text-g-muted'}`}>{state(tt)}</span>
                                    {tt.booked > 0 && <span className="tabular-nums text-g-muted">{t('booked', { count: tt.booked })}</span>}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                {course.timezone && (
                    <p className="mt-3">
                        <button type="button" onClick={() => setBlockOpenRequest(n => n + 1)} className={secondaryButton}>{t('blockDay')}</button>
                    </p>
                )}
            </section>

            <ScheduleSection schedules={sheet.schedules} currency={course.currency} hasTimeZone={Boolean(course.timezone)} review={review} />

            <BlockSection blocks={sheet.blocks} hasTimeZone={Boolean(course.timezone)} startDate={sheet.day.date}
                openRequest={blockOpenRequest} review={review} />

            <ExtrasSection key={JSON.stringify(sheet.extras)} extras={sheet.extras} currency={course.currency}
                courseId={course.id} onSaved={() => router.refresh()} />

            <section aria-labelledby="sheet-history" className="border-t border-g-ink pt-4">
                <h2 id="sheet-history" className="font-golf text-2xl font-bold tracking-tight">{t('historyTitle')}</h2>
                {sheet.changes.length === 0 ? (
                    <p className="mt-4 text-sm text-g-muted">{t('historyEmpty')}</p>
                ) : (
                    <ul className="mt-4 divide-y divide-g-rule">
                        {sheet.changes.map(change => (
                            <li key={change.id} className="py-3 text-sm">
                                <p className="text-g-ink">{change.summary}</p>
                                <p className="mt-0.5 text-xs tabular-nums text-g-muted">
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
