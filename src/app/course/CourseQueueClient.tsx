'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarCheck, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { CourseBookingView } from '@/lib/schemas/golfStaff';
import type { StaffCourse } from '@/lib/server/golf/staff';
import { GOLF_EXTRAS } from '@/lib/golf/extras';
import { formatMoney } from '@/components/golf/format';

type Tab = 'waiting' | 'upcoming' | 'past';
type Action = 'confirm' | 'decline';
const TABS: Tab[] = ['waiting', 'upcoming', 'past'];

const STATUS_KEY: Record<CourseBookingView['status'], string> = {
    held: 'statusHeld', requested: 'statusRequested', confirmed: 'statusConfirmed',
    expired: 'statusExpired', declined: 'statusDeclined', cancelled: 'statusCancelled',
};

const STATUS_STYLE: Record<CourseBookingView['status'], string> = {
    held: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
    requested: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    expired: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
    declined: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
    cancelled: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
};

/**
 * The course's queue, in the admin's idiom: a table in a bordered card, tabs underlined in
 * blue, Confirm in green and Decline behind a Yes/No, results as toasts. Confirming takes the
 * customer's payment, so a row only changes when the server says it did.
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
    const [asking, setAsking] = useState<string | null>(null);

    const lists: Record<Tab, CourseBookingView[]> = { waiting, upcoming, past };
    const shown = lists[tab];
    const several = courses.length > 1;
    const tabLabel: Record<Tab, string> = { waiting: t('tabWaiting'), upcoming: t('tabUpcoming'), past: t('tabPast') };
    const emptyText: Record<Tab, string> = { waiting: t('emptyWaiting'), upcoming: t('emptyUpcoming'), past: t('emptyPast') };
    const hint: Record<Tab, string> = { waiting: t('hintWaiting'), upcoming: t('hintUpcoming'), past: t('hintPast') };

    const formatWhen = (iso: string, tz: string | null, options: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat(locale, { timeZone: tz ?? 'UTC', ...options }).format(new Date(iso));
    const extraName = (code: string) => ((GOLF_EXTRAS as readonly string[]).includes(code) ? tAmenity(code) : code);

    const act = async (booking: CourseBookingView, action: Action) => {
        setAsking(null);
        setBusy(booking.id);
        try {
            const response = await fetch('/api/course/golf-bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({ action, id: booking.id }),
            });
            if (response.ok) {
                toast.success(t(action === 'confirm' ? 'confirmedToast' : 'declinedToast', { reference: booking.reference }));
                router.refresh();
            } else {
                const json = await response.json().catch(() => ({}));
                toast.error(json.error ?? t('actionError'));
            }
        } catch {
            toast.error(t('actionError'));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <header>
                <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    <CalendarCheck className="h-5 w-5" /> {t('title')}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    {courses.length === 0 ? t('noCourses') : courses.map(c => c.name).join(' · ')}
                </p>
            </header>

            {courses.length === 0 ? (
                <p className="rounded-xl border border-slate-200 p-6 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                    {t('noCoursesHelp')}
                </p>
            ) : (
                <>
                    <div role="tablist" aria-label={t('tabsLabel')} className="flex gap-1 border-b border-slate-200 dark:border-white/10">
                        {TABS.map(id => (
                            <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id}
                                aria-controls="queue-panel" onClick={() => setTab(id)}
                                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === id
                                    ? 'border-blue-600 text-blue-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                                {tabLabel[id]}
                                {id === 'waiting' && waiting.length > 0 && (
                                    <span className="ml-2 rounded-full bg-blue-600 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white">{waiting.length}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    <p className="text-sm text-slate-500 dark:text-slate-400">{hint[tab]}</p>

                    <div id="queue-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}
                        className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                        <table className="w-full min-w-[760px] text-left text-sm">
                            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
                                <tr>
                                    <th className="px-4 py-2 font-medium">{t('colReference')}</th>
                                    <th className="px-4 py-2 font-medium">{t('colTeeTime')}</th>
                                    <th className="px-4 py-2 font-medium">{t('colPlayers')}</th>
                                    <th className="px-4 py-2 font-medium">{t('colLead')}</th>
                                    <th className="px-4 py-2 font-medium">{t('colFee')}</th>
                                    <th className="px-4 py-2 font-medium">{tab === 'waiting' ? t('colDecide') : t('colStatus')}</th>
                                    <th className="px-4 py-2 text-right font-medium">{t('colActions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.length === 0 && (
                                    <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">{emptyText[tab]}</td></tr>
                                )}
                                {shown.map(b => (
                                    <tr key={b.id} className="border-t border-slate-100 align-top dark:border-white/5">
                                        <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{b.reference}</td>
                                        <td className="px-4 py-2 tabular-nums">
                                            {formatWhen(b.startsAt, b.timezone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                                            {', '}
                                            <span className="font-mono">{formatWhen(b.startsAt, b.timezone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</span>
                                            {several && <span className="block text-xs text-slate-500">{b.courseName}</span>}
                                        </td>
                                        <td className="px-4 py-2">
                                            <span className="tabular-nums">{b.players === 1 ? t('onePlayer') : t('players', { count: b.players })}</span>
                                            {b.extras.length > 0 && (
                                                <span className="block text-xs text-slate-500">
                                                    {b.extras.map(e => `${extraName(e.code)} × ${e.quantity}`).join(', ')}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{b.leadName}</td>
                                        <td className="px-4 py-2 tabular-nums">{formatMoney(b.greenFeeTotal, b.currency, locale)}</td>
                                        <td className="px-4 py-2">
                                            {tab === 'waiting' && b.decideBy ? (
                                                <span className="tabular-nums">
                                                    {formatWhen(b.decideBy, b.timezone, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}
                                                </span>
                                            ) : (
                                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[b.status]}`}>{t(STATUS_KEY[b.status])}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2">
                                            <span className="flex items-center justify-end gap-2">
                                                {busy === b.id && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden />}
                                                {busy !== b.id && b.status === 'requested' && (
                                                    <>
                                                        <button type="button" onClick={() => void act(b, 'confirm')}
                                                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500">
                                                            {t('confirm')}
                                                        </button>
                                                        {asking === b.id ? (
                                                            <span className="flex items-center gap-1">
                                                                <span className="text-xs text-slate-500">{t('declineAsk')}</span>
                                                                <button type="button" onClick={() => void act(b, 'decline')}
                                                                    className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">{t('yes')}</button>
                                                                <button type="button" onClick={() => setAsking(null)}
                                                                    className="rounded px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-white/10">{t('no')}</button>
                                                            </span>
                                                        ) : (
                                                            <button type="button" onClick={() => setAsking(b.id)}
                                                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
                                                                {t('decline')}
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
