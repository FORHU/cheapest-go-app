'use client';

import { useEffect, useRef } from 'react';
import { FileText, ImageIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatFileSize } from './formatFileSize';
import type { SupportAttachmentView, SupportMessageView } from './types';
import { TranslatedText } from './TranslatedText';
import { readerView } from './translationView';

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
    /**
     * An Agent's reply has arrived and is being translated for this customer. It is held
     * back until then, so this is what tells them one is on its way.
     */
    isReplying?: boolean;
}

export function SupportTranscript({ messages, isTyping, isReplying = false }: SupportTranscriptProps) {
    const t = useTranslations('support');
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages, isTyping, isReplying]);

    return (
        <div
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            className="flex-1 min-h-0 overflow-y-auto px-4 py-3"
        >
            {messages.length === 0 && !isTyping && !isReplying && (
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

            {isReplying && !isTyping && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{t('replying')}</p>
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
                {/*
                  * A notice renders from this reader's own locale file and is never
                  * translated. Anything else goes through `readerView`: an Agent's reply
                  * arrives in the customer's language, marked as a machine translation,
                  * with the Agent's own English one click away.
                  */}
                {isNotice ? (
                    renderBody(message, t)
                ) : (
                    <TranslatedText
                        view={readerView(message, false)}
                        tone={isCustomer ? 'dark' : 'light'}
                        labels={{
                            translated: t('translation.translated'),
                            showOriginal: t('translation.showOriginal'),
                            showTranslation: t('translation.showTranslation'),
                            pending: t('translation.pending'),
                            untranslated: t('translation.untranslated'),
                        }}
                    />
                )}
            </p>

            {message.attachments.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-1">
                    {message.attachments.map(attachment => (
                        <AttachmentLink key={attachment.id} attachment={attachment} />
                    ))}
                </ul>
            )}
        </li>
    );
}

/**
 * One file, as a link rather than a preview.
 *
 * An image is not rendered inline even though it usually could be. What arrives here was
 * uploaded by somebody - the customer, or an Agent forwarding something a customer sent
 * them - and a transcript that renders unreviewed uploads is a page that displays whatever
 * the last person chose to upload. A link makes opening it a decision.
 *
 * The href is this app's route, not the bucket: the route decides whether the person asking
 * may have the file and only then mints a link that works for a few minutes. A message
 * still being sent has no id to fetch by, so its files are named but not yet linked.
 */
function AttachmentLink({ attachment }: { attachment: SupportAttachmentView }) {
    const t = useTranslations('support');
    const Icon = attachment.contentType.startsWith('image/') ? ImageIcon : FileText;

    return (
        <li>
            <a
                href={`/api/support/conversation/attachments/${attachment.id}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('attachments.download', { name: attachment.fileName })}
                className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1.5 text-xs text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-white/5 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-white/10"
            >
                <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                <span className="max-w-[12rem] truncate">{attachment.fileName}</span>
                <span className="shrink-0 text-slate-400 dark:text-slate-500">
                    {formatFileSize(attachment.sizeBytes)}
                </span>
            </a>
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
