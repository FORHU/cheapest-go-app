'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Where the customer types.
 *
 * Disabled rather than merely inert while the conversation is not ready: a box that looks
 * usable and quietly discards what is typed is worse than one that says it is connecting.
 */

interface SupportComposerProps {
    canSend: boolean;
    onSend: (body: string) => void;
}

export function SupportComposer({ canSend, onSend }: SupportComposerProps) {
    const t = useTranslations('support');
    const [value, setValue] = useState('');

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const body = value.trim();
        if (!body || !canSend) return;

        onSend(body);
        setValue('');
    };

    return (
        <form
            onSubmit={submit}
            className="flex shrink-0 items-center gap-2 border-t border-slate-200 px-3 py-3 dark:border-white/10"
        >
            <input
                type="text"
                value={value}
                onChange={event => setValue(event.target.value)}
                disabled={!canSend}
                placeholder={canSend ? t('composer.placeholder') : t('composer.connecting')}
                aria-label={t('composer.placeholder')}
                className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            />
            <button
                type="submit"
                disabled={!canSend || !value.trim()}
                aria-label={t('composer.send')}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <Send className="h-4 w-4" />
            </button>
        </form>
    );
}
