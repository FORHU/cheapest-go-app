'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Luggage, Plane, X } from 'lucide-react';

/**
 * Asking the customer which trip they are writing about.
 *
 * Front-loads the one thing an Agent always has to establish, and does it while the person
 * who knows the answer is still there. It also decides how quickly they are answered: the
 * queue is ordered by how close the linked trip is (ADR-0039), so a customer flying
 * tomorrow who links their flight is seen before someone asking about a receipt.
 *
 * Deliberately skippable and never a gate. "How do refunds work" is about no trip in
 * particular, and a question that cannot be asked until a booking is chosen is a question
 * that goes unasked. Dismissing it is remembered for the session only — this is a prompt,
 * not a setting, and a customer who opens a chat about a different trip next week should be
 * asked again.
 */

interface TripOption {
    bookingReference: string;
    kind: 'stay' | 'flight';
    label: string;
    startsAt: string | null;
}

export function SupportBookingPicker({ conversationId }: { conversationId: string | null }) {
    const t = useTranslations('support.trips');
    const [trips, setTrips] = useState<TripOption[]>([]);
    const [linked, setLinked] = useState<string[]>([]);
    const [dismissed, setDismissed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!conversationId) return;
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch('/api/support/conversation/bookings');
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                setTrips(data.trips ?? []);
                setLinked((data.linked ?? []).map((l: { bookingReference: string }) => l.bookingReference));
            } catch {
                // Offer nothing rather than throw. This runs on every panel open, and the
                // failure it has to survive is the customer being on a bad connection — the
                // moment they most need to write to support. A picker that cannot list
                // trips is a picker that does not appear; the composer below is untouched.
                //
                // Unguarded, the rejection escaped the effect entirely: an unhandled
                // rejection in the browser, and in the test run a fetch that outlived the
                // test that started it.
            } finally {
                // Nothing is rendered until the answer is known: a picker that appears a
                // beat after the panel opens moves the composer under the cursor.
                if (!cancelled) setLoaded(true);
            }
        })();
        return () => { cancelled = true; };
    }, [conversationId]);

    async function choose(bookingReference: string) {
        if (busy) return;
        setBusy(true);
        try {
            const res = await fetch('/api/support/conversation/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingReference }),
            });
            if (!res.ok) return;
            const data = await res.json();
            setLinked((data.linked ?? []).map((l: { bookingReference: string }) => l.bookingReference));
        } catch {
            // The chip simply does not appear. Linking a trip is a convenience that saves an
            // Agent a question; failing it must never take the conversation down with it.
        } finally {
            setBusy(false);
        }
    }

    async function clear(bookingReference: string) {
        if (busy) return;
        setBusy(true);
        try {
            const res = await fetch(
                `/api/support/conversation/bookings?bookingReference=${encodeURIComponent(bookingReference)}`,
                { method: 'DELETE' },
            );
            if (!res.ok) return;
            const data = await res.json();
            setLinked((data.linked ?? []).map((l: { bookingReference: string }) => l.bookingReference));
        } catch {
            // The chip stays where it was. An Agent can detach it, and a trip linked one
            // time too many is a smaller problem than a panel that threw.
        } finally {
            setBusy(false);
        }
    }

    // Nothing to offer: signed out, no bookings, or the answer has not arrived yet.
    if (!loaded || !conversationId || trips.length === 0) return null;

    if (linked.length > 0) {
        const chosen = trips.filter(tr => linked.includes(tr.bookingReference));
        return (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-4 py-2 text-xs dark:border-white/5">
                <span className="text-slate-400">{t('about')}</span>
                {chosen.map(tr => (
                    <span
                        key={tr.bookingReference}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2 pr-1 font-medium text-slate-700 dark:bg-white/10 dark:text-slate-200"
                    >
                        {tr.kind === 'flight' ? <Plane className="h-3 w-3" /> : <Luggage className="h-3 w-3" />}
                        <span className="max-w-[10rem] truncate">{tr.label}</span>
                        <button
                            type="button"
                            onClick={() => void clear(tr.bookingReference)}
                            disabled={busy}
                            aria-label={t('change')}
                            className="rounded-full p-0.5 text-slate-400 transition hover:text-slate-700 disabled:opacity-50 dark:hover:text-slate-100"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </span>
                ))}
            </div>
        );
    }

    if (dismissed) return null;

    return (
        <div className="border-t border-slate-100 px-4 py-2 dark:border-white/5">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('question')}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
                {trips.slice(0, 5).map(tr => (
                    <button
                        key={tr.bookingReference}
                        type="button"
                        onClick={() => void choose(tr.bookingReference)}
                        disabled={busy}
                        className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                    >
                        {tr.kind === 'flight' ? <Plane className="h-3 w-3 shrink-0" /> : <Luggage className="h-3 w-3 shrink-0" />}
                        <span className="truncate">{tr.label}</span>
                        {tr.startsAt && (
                            <span className="shrink-0 text-slate-400">
                                {new Date(tr.startsAt).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                })}
                            </span>
                        )}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    className="rounded-full px-2 py-0.5 text-xs text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
                >
                    {t('skip')}
                </button>
            </div>
        </div>
    );
}
