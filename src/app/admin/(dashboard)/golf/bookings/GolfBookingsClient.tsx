'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarCheck, Loader2 } from 'lucide-react';
import type { GolfBooking } from '@/lib/schemas/golf';

/** Admin-only, so English (CONTEXT.md, "Interface Language"). */

type View = 'waiting' | 'upcoming' | 'past';
type Action = 'confirm' | 'decline' | 'cancel';

const TABS: { view: View; label: string; hint: string }[] = [
    {
        view: 'waiting', label: 'Waiting for us',
        hint: 'Check each request with the course, then Confirm (takes the payment) or Decline (releases it). Requests nobody decides are declined automatically at their deadline.',
    },
    { view: 'upcoming', label: 'Upcoming', hint: 'Confirmed tee times still to be played. Cancel and refund in full if the course closes.' },
    { view: 'past', label: 'Past & closed', hint: 'Played, declined and cancelled bookings, newest first.' },
];

const STATUS_STYLE: Record<GolfBooking['status'], string> = {
    held: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
    requested: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    expired: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
    declined: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
    cancelled: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
};

/** "Sat 10 Oct, 07:38" on the course's clock — the time the course will recognise. */
function courseTime(iso: string, tz: string | null): string {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: tz ?? 'UTC', weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(new Date(iso));
}

export function GolfBookingsClient({ bookings, view }: { bookings: GolfBooking[]; view: View }) {
    const router = useRouter();
    const [busy, setBusy] = useState<string | null>(null);
    const [confirming, setConfirming] = useState<{ id: string; action: Action } | null>(null);

    const act = async (id: string, action: Action, done: string) => {
        setConfirming(null);
        setBusy(id);
        try {
            const response = await fetch('/api/admin/golf-bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, id }),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok) {
                toast.error(json.error ?? 'Something went wrong');
                return;
            }
            toast.success(done);
            router.refresh();
        } finally {
            setBusy(null);
        }
    };

    const ask = (booking: GolfBooking, action: Action, label: string, done: string) =>
        confirming?.id === booking.id && confirming.action === action ? (
            <span className="flex items-center gap-1">
                <span className="text-xs text-slate-500">{label}?</span>
                <button type="button" onClick={() => void act(booking.id, action, done)} className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">Yes</button>
                <button type="button" onClick={() => setConfirming(null)} className="rounded px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-white/10">No</button>
            </span>
        ) : (
            <button type="button" onClick={() => setConfirming({ id: booking.id, action })}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
                {label}
            </button>
        );

    return (
        <div className="flex flex-col gap-4">
            <header>
                <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                    <CalendarCheck className="h-5 w-5" /> Golf Bookings
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">{TABS.find(tab => tab.view === view)!.hint}</p>
            </header>

            <nav className="flex gap-1 border-b border-slate-200 dark:border-white/10" aria-label="Views">
                {TABS.map(tab => (
                    <Link key={tab.view} href={tab.view === 'waiting' ? '/admin/golf/bookings' : `/admin/golf/bookings?view=${tab.view}`}
                        aria-current={tab.view === view ? 'page' : undefined}
                        className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab.view === view
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                        {tab.label}
                    </Link>
                ))}
            </nav>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                <table className="w-full min-w-[880px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
                        <tr>
                            <th className="px-4 py-2 font-medium">Reference</th>
                            <th className="px-4 py-2 font-medium">Course</th>
                            <th className="px-4 py-2 font-medium">Tee time (course time)</th>
                            <th className="px-4 py-2 font-medium">Players</th>
                            <th className="px-4 py-2 font-medium">Customer</th>
                            <th className="px-4 py-2 font-medium">Total</th>
                            <th className="px-4 py-2 font-medium">{view === 'waiting' ? 'Decide by' : 'Status'}</th>
                            <th className="px-4 py-2 text-right font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bookings.length === 0 && (
                            <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Nothing here.</td></tr>
                        )}
                        {bookings.map(b => (
                            <tr key={b.id} className="border-t border-slate-100 align-top dark:border-white/5">
                                <td className="px-4 py-2 font-mono text-xs">{b.reference}</td>
                                <td className="px-4 py-2">{b.courseName}</td>
                                <td className="px-4 py-2 tabular-nums">{courseTime(b.startsAt, b.timezone)}</td>
                                <td className="px-4 py-2 tabular-nums">{b.players}</td>
                                <td className="px-4 py-2">
                                    <span className="block text-slate-900 dark:text-slate-100">{b.leadName}</span>
                                    <span className="block text-xs text-slate-500">{b.contactEmail}</span>
                                </td>
                                <td className="px-4 py-2 tabular-nums">{b.currency} {b.total.toFixed(2)}</td>
                                <td className="px-4 py-2">
                                    {view === 'waiting' && b.decideBy ? (
                                        <span className="tabular-nums">{courseTime(b.decideBy, b.timezone)}</span>
                                    ) : (
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[b.status]}`}>{b.status}</span>
                                    )}
                                </td>
                                <td className="px-4 py-2">
                                    <span className="flex items-center justify-end gap-2">
                                        {busy === b.id && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                                        {busy !== b.id && b.status === 'requested' && (
                                            <>
                                                <button type="button" onClick={() => void act(b.id, 'confirm', `${b.reference} confirmed and charged`)}
                                                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500">
                                                    Confirm
                                                </button>
                                                {ask(b, 'decline', 'Decline', `${b.reference} declined; the card was released`)}
                                            </>
                                        )}
                                        {busy !== b.id && view === 'upcoming' && b.status === 'confirmed' &&
                                            ask(b, 'cancel', 'Cancel & refund', `${b.reference} cancelled and refunded`)}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
