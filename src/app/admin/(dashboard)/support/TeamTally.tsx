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
 */
export function TeamTally({ tally, since }: { tally: HandledTallyView[]; since: string | null }) {
    const [open, setOpen] = useState(false);
    if (tally.length === 0) return null;

    const month = since
        ? new Date(since).toLocaleString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
        : 'this month';

    return (
        <section className="rounded-xl border border-slate-200 text-sm dark:border-white/10">
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
                <div className="overflow-x-auto px-4 pb-3">
                    <table className="w-full text-left text-xs">
                        <thead className="text-slate-500 dark:text-slate-400">
                            <tr>
                                <th className="py-1 pr-4 font-medium">Agent</th>
                                <th className="py-1 pr-4 font-medium">Open now</th>
                                <th className="py-1 font-medium">Handled in {month}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tally.map(row => (
                                <tr key={row.adminId} className="border-t border-slate-100 dark:border-white/5">
                                    <td className="py-1.5 pr-4 text-slate-800 dark:text-slate-100">
                                        {row.name}
                                        {row.role === 'admin' && <span className="ml-1 text-slate-400">· admin</span>}
                                    </td>
                                    <td className="py-1.5 pr-4 tabular-nums">{row.open}</td>
                                    <td className="py-1.5 tabular-nums">{row.handled}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
