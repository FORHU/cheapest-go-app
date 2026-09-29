'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { HandledTallyView } from './types';

/**
 * Admins only: what each person holds now, and how many chats they have handled this month —
 * the figure pay is worked out from (CONTEXT.md, "Handled").
 *
 * Handled is read from recorded resolutions: a chat counts for whoever held it at the moment
 * it was resolved, not for whoever holds it now and not for whoever wrote the most. Collapsed
 * by default — it is looked up, not watched.
 *
 * A fixed-layout table with the name column truncating, because a display name is whatever
 * someone typed: a paragraph-long name once stretched the numbers into an unreadable sliver.
 */
export function TeamTally({ tally, since }: { tally: HandledTallyView[]; since: string | null }) {
    const [open, setOpen] = useState(false);
    if (tally.length === 0) return null;

    const month = since
        ? new Date(since).toLocaleString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
        : 'this month';
    const monthShort = since
        ? new Date(since).toLocaleString(undefined, { month: 'short', timeZone: 'UTC' })
        : 'Month';

    return (
        <section className="min-w-0 rounded-xl border border-slate-200 text-sm dark:border-white/10">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                aria-expanded={open}
                className="flex w-full items-center gap-1.5 px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-200"
            >
                {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                Team · handled in {month}
            </button>

            {open && (
                <div className="px-4 pb-3">
                    <table className="w-full max-w-2xl table-fixed text-left text-xs">
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
                </div>
            )}
        </section>
    );
}
