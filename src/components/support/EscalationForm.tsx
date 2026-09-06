'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Collects the one thing an escalated conversation needs: a way to answer it.
 *
 * Shown only to a guest, and only when they ask for a person or the assistant decides to
 * hand over. A signed-in customer never sees it — their account is the reply path.
 *
 * These details are a reply-to address and nothing more. They never unlock a booking
 * lookup: see ADR-0029.
 */

export interface EscalationDetails {
    name: string;
    email: string;
}

interface EscalationFormProps {
    submitting: boolean;
    onSubmit: (details: EscalationDetails) => void;
    onCancel: () => void;
}

/** Matches the server's check, so the two agree on what counts. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function EscalationForm({ submitting, onSubmit, onCancel }: EscalationFormProps) {
    const t = useTranslations('support');
    const nameId = useId();
    const emailId = useId();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');

    const submit = (event: React.FormEvent) => {
        event.preventDefault();

        const trimmedName = name.trim();
        const trimmedEmail = email.trim();
        if (!trimmedName || !EMAIL.test(trimmedEmail) || submitting) return;

        onSubmit({ name: trimmedName, email: trimmedEmail });
    };

    return (
        <form
            onSubmit={submit}
            className="shrink-0 space-y-3 border-t border-slate-200 px-4 py-4 dark:border-white/10"
        >
            <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {t('escalate.title')}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {t('escalate.intro')}
                </p>
            </div>

            <div className="space-y-2">
                <label htmlFor={nameId} className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t('escalate.name')}
                </label>
                <input
                    id={nameId}
                    value={name}
                    onChange={event => setName(event.target.value)}
                    autoComplete="name"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                />
            </div>

            <div className="space-y-2">
                <label htmlFor={emailId} className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    {t('escalate.email')}
                </label>
                <input
                    id={emailId}
                    type="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    autoComplete="email"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                />
            </div>

            <div className="flex items-center gap-2 pt-1">
                <button
                    type="submit"
                    disabled={submitting}
                    className="h-9 flex-1 rounded-lg bg-blue-600 text-sm font-medium text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {t('escalate.submit')}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="h-9 rounded-lg px-3 text-sm text-slate-500 transition hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:text-slate-100"
                >
                    {t('escalate.cancel')}
                </button>
            </div>
        </form>
    );
}
