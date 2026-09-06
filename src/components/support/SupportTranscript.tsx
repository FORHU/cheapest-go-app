'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { SupportMessageView } from './types';

/**
 * The conversation as the customer reads it.
 *
 * A `system` row is rendered from its notice code so the customer reads it in their own
 * language, with the stored English as the fallback for a code this build has not heard
 * of — a row written by a newer deployment and read by a tab that has been open a while.
 */

interface SupportTranscriptProps {
    messages: SupportMessageView[];
    isTyping: boolean;
}

export function SupportTranscript({ messages, isTyping }: SupportTranscriptProps) {
    const t = useTranslations('support');
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages, isTyping]);

    return (
        <div
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            className="flex-1 min-h-0 overflow-y-auto px-4 py-3"
        >
            {messages.length === 0 && !isTyping && (
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {t('empty')}
                </p>
            )}

            <ul className="flex flex-col gap-3">
                {messages.map(message => (
                    <SupportMessageRow key={message.id} message={message} />
                ))}
            </ul>

            {isTyping && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t('typing')}</p>
            )}

            <div ref={endRef} />
        </div>
    );
}

function SupportMessageRow({ message }: { message: SupportMessageView }) {
    const t = useTranslations('support');
    const isCustomer = message.senderType === 'guest';
    const isNotice = message.senderType === 'system';

    return (
        <li className={isCustomer ? 'self-end max-w-[85%]' : 'self-start max-w-[85%]'}>
            <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 mb-1">
                {t(`sender.${message.senderType}`)}
            </span>

            <p
                className={
                    isNotice
                        ? 'rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-slate-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-slate-200'
                        : isCustomer
                            ? 'rounded-lg bg-blue-600 px-3 py-2 text-sm text-white'
                            : 'rounded-lg bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-200 dark:bg-white/5 dark:text-slate-100 dark:ring-white/10'
                }
            >
                {renderBody(message, t)}
            </p>
        </li>
    );
}

/**
 * A notice reads from the locale file; anything else is the sender's own words.
 *
 * `t.has` rather than a try/catch: next-intl throws on a missing key in development and
 * renders the key itself in production, and neither is a thing to show a customer who is
 * already having a problem.
 */
function renderBody(
    message: SupportMessageView,
    t: ReturnType<typeof useTranslations<'support'>>,
): string {
    if (message.senderType !== 'system' || !message.noticeCode) return message.body;

    const key = `notice.${message.noticeCode}` as Parameters<typeof t.has>[0];
    return t.has(key) ? t(key as Parameters<typeof t>[0]) : message.body;
}
