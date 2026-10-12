'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { CourseBookingView } from '@/lib/schemas/golfStaff';
import type { StaffCourse } from '@/lib/server/golf/staff';
import { GOLF_EXTRAS } from '@/lib/golf/extras';

type Tab = 'waiting' | 'upcoming' | 'past';
const TABS: Tab[] = ['waiting', 'upcoming', 'past'];

const STATUS_KEY: Record<CourseBookingView['status'], string> = {
    held: 'statusHeld', requested: 'statusRequested', confirmed: 'statusConfirmed',
    expired: 'statusExpired', declined: 'statusDeclined', cancelled: 'statusCancelled',
};

/**
 * The course's queue. Confirming takes the customer's payment, so each action is one press
 * with the outcome shown on the row; a row never changes without the server saying it did.
 */
export function CourseQueueClient({ courses, waiting, upcoming, past }: {
    courses: StaffCourse[];
    waiting: CourseBookingView[];
    upcoming: CourseBookingView[];
    past: CourseBookingView[];
}) {
    const t = useTranslations('golf.staff.portal');
    const tAmenity = useTranslations('golf.amenities');
    const locale = useLocale();
    const router = useRouter();
    const [tab, setTab] = useState<Tab>('waiting');
    const [busy, setBusy] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const lists: Record<Tab, CourseBookingView[]> = { waiting, upcoming, past };
    const shown = lists[tab];
    const several = courses.length > 1;
    const tabLabel: Record<Tab, string> = { waiting: t('tabWaiting'), upcoming: t('tabUpcoming'), past: t('tabPast') };
    const emptyText: Record<Tab, string> = { waiting: t('emptyWaiting'), upcoming: t('emptyUpcoming'), past: t('emptyPast') };

    const formatWhen = (iso: string, tz: string | null, options: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat(locale, { timeZone: tz ?? 'UTC', ...options }).format(new Date(iso));
    const extraName = (code: string) => ((GOLF_EXTRAS as readonly string[]).includes(code) ? tAmenity(code) : code);

    const act = async (booking: CourseBookingView, action: 'confirm' | 'decline') => {
        setBusy(booking.id);
        setErrors(({ [booking.id]: _drop, ...rest }) => rest);
        try {
            const response = await fetch('/api/course/golf-bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({ action, id: booking.id }),
            });
            if (response.ok) {
                router.refresh();
            } else {
                const json = await response.json().catch(() => ({}));
                setErrors(current => ({ ...current, [booking.id]: json.error ?? t('actionError') }));
            }
        } catch {
            setErrors(current => ({ ...current, [booking.id]: t('actionError') }));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="mx-auto max-w-4xl px-4 pb-24 pt-12">
            <header className="border-b border-g-ink pb-6">
                <h1 className="font-golf text-4xl font-extrabold leading-tight tracking-tight text-g-ink md:text-5xl">{t('title')}</h1>
                <p className="mt-3 text-g-muted">
                    {courses.length === 0 ? t('noCourses') : courses.map(c => c.name).join(' · ')}
                </p>
            </header>

            {courses.length === 0 ? (
                <p className="mt-10 max-w-xl text-g-muted">{t('noCoursesHelp')}</p>
            ) : (
                <>
                    <div role="tablist" aria-label={t('tabsLabel')} className="mt-8 flex gap-6 border-b border-g-rule">
                        {TABS.map(id => (
                            <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id}
                                aria-controls="queue-panel" onClick={() => setTab(id)}
                                className={`-mb-px border-b-2 pb-2 text-sm transition-colors ${tab === id
                                    ? 'border-g-accent font-semibold text-g-ink'
                                    : 'border-transparent text-g-muted hover:text-g-ink'}`}>
                                {tabLabel[id]}
                                {id === 'waiting' && waiting.length > 0 && (
                                    <span className="ml-2 rounded-sm bg-g-accent px-1.5 py-0.5 text-xs font-semibold tabular-nums text-g-accent-ink">{waiting.length}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div id="queue-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
                        {shown.length === 0 ? (
                            <p className="mt-8 max-w-xl text-g-muted">{emptyText[tab]}</p>
                        ) : (
                            <ul className="divide-y divide-g-rule">
                                {shown.map(b => (
                                    <li key={b.id} className="grid gap-4 py-6 sm:grid-cols-[1fr_auto]">
                                        <div className="min-w-0">
                                            <p className="font-golf text-xl font-bold leading-snug tracking-tight text-g-ink">
                                                {formatWhen(b.startsAt, b.timezone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                                                {' · '}
                                                <span className="font-mono tabular-nums">
                                                    {formatWhen(b.startsAt, b.timezone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}
                                                </span>
                                            </p>
                                            <p className="mt-1 text-g-ink">
                                                {b.leadName} · {b.players === 1 ? t('onePlayer') : t('players', { count: b.players })}
                                                {several && <span className="text-g-muted"> · {b.courseName}</span>}
                                            </p>
                                            {b.extras.length > 0 && (
                                                <p className="mt-1 text-sm text-g-muted">
                                                    {b.extras.map(e => `${extraName(e.code)} × ${e.quantity}`).join(', ')}
                                                </p>
                                            )}
                                            <p className="mt-1 text-xs tabular-nums text-g-muted">{t('reference', { reference: b.reference })}</p>
                                        </div>

                                        <div className="flex flex-col items-start gap-2 sm:items-end">
                                            {b.status === 'requested' ? (
                                                <>
                                                    {b.decideBy && (
                                                        <p className="text-xs text-g-muted">
                                                            {t('decideBy', {
                                                                date: formatWhen(b.decideBy, b.timezone, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
                                                            })}
                                                        </p>
                                                    )}
                                                    <div className="flex gap-2">
                                                        <button type="button" disabled={busy === b.id} onClick={() => act(b, 'confirm')}
                                                            className="flex items-center gap-2 rounded-sm bg-g-accent px-5 py-2 text-sm font-semibold text-g-accent-ink transition duration-200 hover:bg-g-accent-hover disabled:opacity-60 motion-safe:active:scale-[0.98]">
                                                            {busy === b.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {t('confirm')}
                                                        </button>
                                                        <button type="button" disabled={busy === b.id} onClick={() => act(b, 'decline')}
                                                            className="rounded-sm border border-g-rule px-5 py-2 text-sm font-semibold text-g-ink transition duration-200 hover:border-g-ink disabled:opacity-60 motion-safe:active:scale-[0.98]">
                                                            {t('decline')}
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                <span className="text-sm font-medium text-g-muted">{t(STATUS_KEY[b.status])}</span>
                                            )}
                                            {errors[b.id] && <p role="alert" className="max-w-xs text-sm text-red-600 dark:text-red-400 sm:text-right">{errors[b.id]}</p>}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
