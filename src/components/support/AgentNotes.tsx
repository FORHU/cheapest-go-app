'use client';

import { useState } from 'react';
import { Loader2, Trash2, Lock } from 'lucide-react';
import type { SupportNoteView } from '@/app/admin/(dashboard)/support/types';

/**
 * What Agents write to each other about a Support Chat.
 *
 * Kept visually apart from the transcript and labelled as private, because the failure this
 * guards against is human rather than technical: a Note is safe from the customer by
 * construction — it lives in its own table their routes never query — but an Agent who
 * mistakes the note box for the reply box has still said it to them. The amber ground and
 * the padlock exist to make that mistake feel wrong before it is made.
 */
export function AgentNotes({
    conversationId,
    notes = [],
    currentAdminId,
    onChanged,
}: {
    conversationId: string;
    /** Defaulted for the same reason as LinkedBookings: a missing field must not blank the panel. */
    notes?: SupportNoteView[];
    /** Whose notes may be deleted here — a Note is one person's account and stays theirs. */
    currentAdminId: string | null;
    onChanged: () => void;
}) {
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        const body = draft.trim();
        if (!body || busy) return;

        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/support/conversations/${conversationId}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error ?? 'Could not save that note');
            }
            setDraft('');
            onChanged();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save that note');
        } finally {
            setBusy(false);
        }
    }

    async function remove(noteId: string) {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/support/conversations/${conversationId}/notes?noteId=${encodeURIComponent(noteId)}`,
                { method: 'DELETE' },
            );
            if (!res.ok) throw new Error('Could not remove that note');
            onChanged();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not remove that note');
        } finally {
            setBusy(false);
        }
    }

    return (
        <section
            aria-label="Internal notes"
            className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-950/20"
        >
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-900 dark:text-amber-200">
                <Lock className="h-3 w-3" aria-hidden />
                Internal notes
                <span className="font-normal normal-case tracking-normal text-amber-700/80 dark:text-amber-300/70">
                    — the customer never sees these
                </span>
            </h3>

            {notes.length > 0 && (
                <ul className="mt-2 space-y-2">
                    {notes.map(note => (
                        <li
                            key={note.id}
                            className="group flex items-start justify-between gap-2 rounded-md bg-white/70 px-2.5 py-1.5 dark:bg-white/5"
                        >
                            <div className="min-w-0">
                                <p className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-200">
                                    {note.body}
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                    {new Date(note.createdAt).toLocaleString()}
                                </p>
                            </div>
                            {/*
                              * Only the author's own. A conversation whose annotations can be
                              * tidied by anyone is one nobody can rely on later.
                              */}
                            {note.authorAdminId === currentAdminId && (
                                <button
                                    type="button"
                                    onClick={() => void remove(note.id)}
                                    disabled={busy}
                                    aria-label="Delete this note"
                                    className="shrink-0 rounded p-1 text-slate-400 opacity-0 transition hover:bg-white hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50 dark:hover:bg-white/10"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            <form onSubmit={submit} className="mt-2 flex items-start gap-2">
                {/*
                  * Labelled in full, and naming the consequence rather than the field. This
                  * panel now holds two text boxes — one reaches the customer, one never
                  * does — and a screen reader announcing "textbox" twice gives no way to
                  * tell them apart. The amber ground carries that meaning for everyone
                  * else and is silent here.
                  */}
                <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    rows={2}
                    placeholder="Add a note for other Agents…"
                    aria-label="Internal note — not sent to the customer"
                    className="min-h-0 flex-1 resize-y rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 dark:border-amber-900/40 dark:bg-white/5 dark:text-slate-200"
                />
                <button
                    type="submit"
                    disabled={busy || !draft.trim()}
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-amber-600 px-3 text-xs font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
                >
                    {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                    Save
                </button>
            </form>

            {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </section>
    );
}
