'use client';

import { useState } from 'react';
import type { UrgencyView } from '@/app/admin/(dashboard)/support/types';

/**
 * An Agent overruling how urgent the trip dates say this is.
 *
 * Offered as words rather than a priority dropdown, because the meaningful choice is not
 * which of four labels to pick — it is whether to take the decision away from the dates at
 * all. "Let the dates decide" is therefore a first-class option and the default, and it is
 * not the same as choosing Normal: clearing the override hands the conversation back to a
 * rule that keeps moving on its own as a departure approaches, while Normal pins it at
 * ordinary however close the flight gets. A dropdown containing only tiers would hide that
 * difference behind whichever one happened to be selected.
 */

const CHOICES: { value: UrgencyView | null; label: string }[] = [
    { value: null, label: 'Let the dates decide' },
    { value: 'critical', label: 'Travelling now' },
    { value: 'high', label: 'This week' },
    { value: 'normal', label: 'Ordinary' },
    { value: 'low', label: 'Not urgent' },
];

export function UrgencyOverride({
    conversationId,
    priority,
    onChanged,
}: {
    conversationId: string;
    /** null means nobody has overruled the dates. */
    priority: UrgencyView | null;
    onChanged: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function set(value: UrgencyView | null) {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/support/conversations/${conversationId}/priority`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    // Sent explicitly, including null: an absent field would read as "no
                    // change" and there would be no way to clear an override.
                    body: JSON.stringify({ priority: value }),
                },
            );
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error ?? 'Could not change the priority');
            }
            onChanged();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not change the priority');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="mt-2">
            <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-[11px] uppercase tracking-[0.12em] text-slate-400">
                    Urgency
                </span>
                {CHOICES.map(choice => {
                    const active = choice.value === priority;
                    return (
                        <button
                            key={choice.label}
                            type="button"
                            onClick={() => void set(choice.value)}
                            disabled={busy}
                            aria-pressed={active}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition disabled:opacity-50 ${
                                active
                                    ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-white/20'
                            }`}
                        >
                            {choice.label}
                        </button>
                    );
                })}
            </div>
            {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
    );
}
