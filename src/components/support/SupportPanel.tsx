'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SupportTranscript } from './SupportTranscript';
import { SupportComposer } from './SupportComposer';
import { EscalationForm } from './EscalationForm';
import { useSupportChat } from './useSupportChat';

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

interface SupportPanelProps {
    onClose: () => void;
}

export function SupportPanel({ onClose }: SupportPanelProps) {
    const t = useTranslations('support');
    const panelRef = useRef<HTMLDivElement>(null);
    const chat = useSupportChat(true);

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

    const status = chat.conversation?.status;

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
                    {chat.canEscalate && (
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
