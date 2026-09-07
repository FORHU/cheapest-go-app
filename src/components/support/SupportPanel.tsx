'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { SupportTranscript } from './SupportTranscript';
import { SupportComposer } from './SupportComposer';
import { EscalationForm } from './EscalationForm';
import { useSupportChat } from './useSupportChat';
import { formatReopen } from './reopenTime';

/**
 * The panel itself.
 *
 * Full-screen under `sm` and an anchored card above it. A 78vw floating box on a phone —
 * which is what the widget this was ported from does — leaves a cramped composer fighting
 * the on-screen keyboard, and `dvh` rather than `vh` is what stops iOS Safari clipping the
 * bottom of it when the keyboard opens.
 *
 * `z-[90]` keeps it under the app's modals at `z-[100]`, for the same reason the launcher
 * sits at `z-40`.
 */

export type SupportChat = ReturnType<typeof useSupportChat>;

interface SupportPanelProps {
    chat: SupportChat;
    onClose: () => void;
}

export function SupportPanel({ chat, onClose }: SupportPanelProps) {
    const t = useTranslations('support');
    const panelRef = useRef<HTMLDivElement>(null);

    // Escape closes, as it does for every other overlay in the app.
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    // Move focus in when it opens, so a keyboard user is not left at the top of the page.
    useEffect(() => {
        panelRef.current?.focus();
    }, []);

    const locale = useLocale();
    const status = chat.conversation?.status;
    const reopen = formatReopen(chat.nextOpening, locale);

    return (
        <div
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-label={t('title')}
            tabIndex={-1}
            className="fixed inset-0 z-[90] flex h-[100dvh] w-full flex-col bg-white outline-none sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(600px,calc(100dvh-8rem))] sm:w-96 sm:rounded-2xl sm:shadow-2xl sm:ring-1 sm:ring-slate-200 dark:bg-slate-950 dark:sm:ring-white/10"
        >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-white/10">
                <div>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {t('title')}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {status === 'waiting_human'
                            ? t('status.waiting')
                            : status === 'human_active'
                                ? t('status.human')
                                : t('subtitle')}
                    </p>

                    {/*
                      * When the team is back. Only while queued, and only out of hours —
                      * a customer being answered now does not need to know about Monday.
                      * Rendered live so editing the hours in the desk changes it, rather
                      * than being frozen into the stored notice.
                      */}
                    {status === 'waiting_human' && reopen && (
                        <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                            {reopen.today
                                ? t('status.backToday', { when: reopen.when })
                                : t('status.backOn', { when: reopen.when })}
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('launcherClose')}
                    className="rounded-lg p-1 text-slate-400 transition hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-slate-100"
                >
                    <X className="h-5 w-5" />
                </button>
            </header>

            <SupportTranscript messages={chat.messages} isTyping={chat.isTyping} />

            {chat.needsDetails ? (
                <EscalationForm
                    submitting={chat.escalating}
                    onSubmit={details => void chat.escalate(details)}
                    onCancel={chat.dismissDetails}
                />
            ) : (
                <>
                    {/*
                      * A standing line rather than a repeated message. The notice is
                      * written to the transcript once; this keeps the reason visible while
                      * the customer carries on typing, with the way out beside it.
                      */}
                    {chat.assistantOffline && chat.canEscalate && (
                        <div className="mx-4 mb-2 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                            <span>{t('status.offline')}</span>
                            <button
                                type="button"
                                onClick={() => void chat.escalate()}
                                disabled={chat.escalating}
                                className="font-semibold underline underline-offset-2 transition hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                            >
                                {t('escalate.ask')}
                            </button>
                        </div>
                    )}

                    {chat.canEscalate && !chat.assistantOffline && (
                        <div className="shrink-0 px-4 pb-1">
                            <button
                                type="button"
                                onClick={() => void chat.escalate()}
                                disabled={chat.escalating}
                                className="text-xs font-medium text-blue-600 underline-offset-2 transition hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:text-blue-400"
                            >
                                {t('escalate.ask')}
                            </button>
                        </div>
                    )}
                    <SupportComposer canSend={chat.canSend} onSend={chat.send} />
                </>
            )}
        </div>
    );
}
