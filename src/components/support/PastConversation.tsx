'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SupportTranscript } from './SupportTranscript';
import type { SupportMessageView } from './types';

/**
 * One of the customer's finished chats, read-only.
 *
 * A resolved chat is never reopened — a returning customer starts a new one, so a new topic
 * does not land under an old reference (CONTEXT.md, "Support Chat"). This is how an earlier
 * answer stays reachable: opened from "Previous conversation", shown in place of the current
 * chat with no composer, and closed back to it.
 */
export function PastConversation({ reference, onBack }: { reference: string; onBack: () => void }) {
    const t = useTranslations('support');
    const [messages, setMessages] = useState<SupportMessageView[] | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const response = await fetch(`/api/support/conversation/history/${encodeURIComponent(reference)}`);
                if (!response.ok) throw new Error(String(response.status));
                const data = (await response.json()) as { messages?: SupportMessageView[] };
                if (!cancelled) setMessages(data.messages ?? []);
            } catch {
                if (!cancelled) setFailed(true);
            }
        })();
        return () => { cancelled = true; };
    }, [reference]);

    return (
        <>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 py-2 text-xs dark:border-white/10">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-1 font-medium text-blue-600 transition hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400"
                >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                    {t('history.back')}
                </button>
                <span className="font-mono text-slate-400">{reference}</span>
            </div>

            {messages === null && !failed && (
                <p className="flex items-center gap-2 p-4 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                </p>
            )}
            {failed && <p className="p-4 text-sm text-slate-500">{t('history.unavailable')}</p>}
            {messages && <SupportTranscript messages={messages} isTyping={false} />}

            <p className="shrink-0 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
                {t('history.closed')}
            </p>
        </>
    );
}
