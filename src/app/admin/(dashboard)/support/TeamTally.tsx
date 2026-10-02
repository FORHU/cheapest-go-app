'use client';

import { useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import type { HandledTallyView } from './types';

/**
 * Admins only: what each person holds now, and how many chats they have handled this month —
 * the figure pay is worked out from (CONTEXT.md, "Handled").
 *
 * Handled is read from recorded resolutions: a chat counts for whoever held it at the moment
 * it was resolved, not for whoever holds it now and not for whoever wrote the most. Behind a
 * button beside the tabs — it is looked up, not watched.
 *
 * A fixed-layout table with the name column truncating, because a display name is whatever
 * someone typed: a paragraph-long name once stretched the numbers into an unreadable sliver.
 */
export function TeamTally({ tally, since }: { tally: HandledTallyView[]; since: string | null }) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);

    // Closes the way a popover is expected to: a click elsewhere, or Escape.
    useEffect(() => {
        if (!open) return;
        const onPointer = (event: MouseEvent) => {
            if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const month = since
        ? new Date(since).toLocaleString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
        : 'this month';
    const monthShort = since
        ? new Date(since).toLocaleString(undefined, { month: 'short', timeZone: 'UTC' })
        : 'Month';

    return (
        <div ref={root} className="relative">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                aria-expanded={open}
                aria-controls="support-team-tally"
                className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-sm text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
                Team <Users className="h-3.5 w-3.5" aria-hidden />
            </button>

            {open && (
                <section
                    id="support-team-tally"
                    aria-label="Team"
                    className="absolute right-0 top-full z-30 mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-xl dark:border-white/10 dark:bg-slate-900"
                >
                    <h2 className="mb-2 font-medium text-slate-700 dark:text-slate-200">Handled in {month}</h2>
                    {tally.length === 0 ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">No one has held a chat yet.</p>
                    ) : (
                        <table className="w-full table-fixed text-left text-xs">
                            <colgroup>
                                <col />
                                <col className="w-20" />
                                <col className="w-24" />
                            </colgroup>
                            <thead className="text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="py-1.5 pr-4 font-medium">Agent</th>
                                    <th className="py-1.5 pr-2 text-right font-medium">Open now</th>
                                    <th className="py-1.5 text-right font-medium" title={`Handled in ${month}`}>
                                        Handled · {monthShort}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {tally.map(row => (
                                    <tr key={row.adminId} className="border-t border-slate-100 dark:border-white/5">
                                        <td className="py-1.5 pr-4">
                                            <span className="flex min-w-0 items-center gap-1.5">
                                                <span className="truncate text-slate-800 dark:text-slate-100" title={row.name}>
                                                    {row.name}
                                                </span>
                                                {row.role === 'admin' && (
                                                    <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-400">
                                                        Admin
                                                    </span>
                                                )}
                                            </span>
                                        </td>
                                        <td className="py-1.5 pr-2 text-right tabular-nums">{row.open}</td>
                                        <td className="py-1.5 text-right tabular-nums">{row.handled}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </section>
            )}
        </div>
    );
}
