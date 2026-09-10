'use client';

import { useState } from 'react';
import { Loader2, X, Plus, Luggage } from 'lucide-react';
import type { LinkedBookingView } from '@/app/admin/(dashboard)/support/types';

/**
 * The trips a Support Chat is about.
 *
 * Any number, including none, and none is shown as a plain invitation rather than an error
 * — a question about how refunds work is about no trip in particular and the panel should
 * not imply something is missing.
 *
 * Whether the customer or an Agent attached each one is shown, because that is the question
 * a refund dispute actually asks: was this trip named by the person claiming it, or by us?
 */
export function LinkedBookings({
    conversationId,
    bookings = [],
    onChanged,
}: {
    conversationId: string;
    /**
     * Defaulted rather than required, because the cost of it being absent is the whole
     * conversation. This renders inside the Agent's detail panel, so a response without the
     * field — an older server during a rolling deploy, a shape that changed — would throw
     * here and blank the transcript the Agent was reading. An empty trip list is a true
     * statement about a conversation with no trips; a blank screen is not.
     */
    bookings?: LinkedBookingView[];
    onChanged: () => void;
}) {
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function link(e: React.FormEvent) {
        e.preventDefault();
        const bookingReference = draft.trim().toUpperCase();
        if (!bookingReference || busy) return;

        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/support/conversations/${conversationId}/bookings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingReference }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error ?? 'Could not link that booking');
            }
            setDraft('');
            setAdding(false);
            onChanged();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not link that booking');
        } finally {
            setBusy(false);
        }
    }

    async function unlink(reference: string) {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/support/conversations/${conversationId}/bookings?bookingReference=${encodeURIComponent(reference)}`,
                { method: 'DELETE' },
            );
            if (!res.ok) throw new Error('Could not unlink that booking');
            onChanged();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not unlink that booking');
        } finally {
            setBusy(false);
        }
    }

    return (
        <section aria-label="Linked bookings" className="mt-2">
            <div className="flex flex-wrap items-center gap-1.5">
                <Luggage className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />

                {bookings.length === 0 && !adding && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        No trip linked
                    </span>
                )}

                {bookings.map(b => (
                    <span
                        key={b.bookingReference}
                        className={`group inline-flex items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-xs font-medium ${
                            // A reference matching nothing is marked rather than hidden. It
                            // contributes no dates to Urgency, so a chat about an imminent
                            // flight would sit in the queue looking ordinary and nobody
                            // would know why.
                            b.known === false
                                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
                                : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200'
                        }`}
                        title={
                            b.known === false
                                ? 'No booking here matches this reference — check it, or it may be a supplier booking that never reached this database'
                                : b.linkedBy
                                    ? 'Attached by an Agent'
                                    : 'Chosen by the customer when they opened the chat'
                        }
                    >
                        {b.bookingReference}
                        {b.known === false && (
                            <span className="text-[10px] font-normal">not found</span>
                        )}
                        {/*
                          * Who named the trip. Only the Agent case is marked: the customer
                          * choosing their own booking is the ordinary path, and a badge on
                          * every chip would say nothing.
                          */}
                        {b.linkedBy && (
                            <span className="text-[10px] font-normal text-slate-400">agent</span>
                        )}
                        <button
                            type="button"
                            onClick={() => void unlink(b.bookingReference)}
                            disabled={busy}
                            aria-label={`Unlink ${b.bookingReference}`}
                            className="rounded-full p-0.5 text-slate-400 transition hover:bg-white hover:text-red-600 disabled:opacity-50 dark:hover:bg-white/10"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </span>
                ))}

                {adding ? (
                    <form onSubmit={link} className="inline-flex items-center gap-1">
                        {/*
                          * Format-agnostic on purpose. Every booking on this system today
                          * carries the legacy `FORHU-…` reference; new sales mint `CG-`/`GG-`.
                          * Both are live at once, so a hint showing either shape would read
                          * as a requirement that most real references fail.
                          */}
                        <input
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            autoFocus
                            placeholder="Booking reference"
                            spellCheck={false}
                            className="h-6 w-36 rounded border border-slate-200 px-1.5 font-mono text-xs uppercase dark:border-white/10 dark:bg-white/5"
                        />
                        <button
                            type="submit"
                            disabled={busy || !draft.trim()}
                            className="flex h-6 items-center rounded bg-blue-600 px-2 text-[11px] font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
                        >
                            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Link'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setAdding(false); setDraft(''); setError(null); }}
                            className="flex h-6 items-center rounded px-1.5 text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                        >
                            Cancel
                        </button>
                    </form>
                ) : (
                    <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-500 transition hover:border-slate-400 hover:text-slate-700 dark:border-white/15 dark:text-slate-400"
                    >
                        <Plus className="h-3 w-3" /> Link a trip
                    </button>
                )}
            </div>

            {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </section>
    );
}
