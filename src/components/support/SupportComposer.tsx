'use client';

import { useRef, useState } from 'react';
import { Paperclip, Send, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MAX_MESSAGE_LENGTH, MESSAGE_COUNTER_FROM } from '@/lib/support/limits';
import { formatFileSize } from './formatFileSize';
import type { SupportAttachmentView } from './types';

/**
 * Where the customer types.
 *
 * Disabled rather than merely inert while the conversation is not ready: a box that looks
 * usable and quietly discards what is typed is worse than one that says it is connecting.
 *
 * Files are uploaded as soon as they are picked, not when the message is sent. That is why
 * they can be removed from here: what is on screen already exists on the server, and
 * pressing send is only what binds it to a message.
 */

/** Mirrors the server allowlist. A picker offering types the route refuses wastes a trip. */
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif,image/heic,application/pdf';

interface SupportComposerProps {
    canSend: boolean;
    onSend: (body: string) => void;
    /** Files uploaded and waiting to go with the next message. */
    attachments: SupportAttachmentView[];
    /** False when the deployment has no bucket configured; the paperclip is hidden. */
    canAttach: boolean;
    uploading: boolean;
    /** Why the last upload was refused, in the server's words. */
    uploadError: string | null;
    onAttach: (file: File) => void;
    onRemoveAttachment: (attachmentId: string) => void;
}

export function SupportComposer({
    canSend,
    onSend,
    attachments,
    canAttach,
    uploading,
    uploadError,
    onAttach,
    onRemoveAttachment,
}: SupportComposerProps) {
    const t = useTranslations('support');
    const [value, setValue] = useState('');
    const fileInput = useRef<HTMLInputElement>(null);

    // A message is sendable if it carries words or files. "Here is the confirmation you
    // asked for" is often entirely the attachment.
    const hasSomethingToSend = Boolean(value.trim()) || attachments.length > 0;

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!hasSomethingToSend || !canSend) return;

        onSend(value.trim());
        setValue('');
    };

    const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) onAttach(file);
        // Cleared so picking the same file twice in a row still fires a change event.
        event.target.value = '';
    };

    return (
        <form
            onSubmit={submit}
            className="flex shrink-0 flex-col gap-2 border-t border-slate-200 px-3 py-3 dark:border-white/10"
        >
            {attachments.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                    {attachments.map(attachment => (
                        <li
                            key={attachment.id}
                            className="flex items-center gap-1.5 rounded-md bg-slate-100 py-1 pl-2 pr-1 text-xs text-slate-700 dark:bg-white/10 dark:text-slate-200"
                        >
                            <span className="max-w-[10rem] truncate">{attachment.fileName}</span>
                            <span className="text-slate-400 dark:text-slate-500">
                                {formatFileSize(attachment.sizeBytes)}
                            </span>
                            <button
                                type="button"
                                onClick={() => onRemoveAttachment(attachment.id)}
                                aria-label={t('attachments.remove', { name: attachment.fileName })}
                                className="rounded p-0.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-white/10 dark:hover:text-white"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {uploadError && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                    {uploadError}
                </p>
            )}

            <div className="flex items-center gap-2">
                {canAttach && (
                    <>
                        <input
                            ref={fileInput}
                            type="file"
                            accept={ACCEPTED_TYPES}
                            onChange={pick}
                            className="hidden"
                            tabIndex={-1}
                        />
                        <button
                            type="button"
                            onClick={() => fileInput.current?.click()}
                            disabled={!canSend || uploading}
                            aria-label={uploading ? t('attachments.uploading') : t('attachments.attach')}
                            title={t('attachments.attach')}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                            <Paperclip className={uploading ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
                        </button>
                    </>
                )}

                <input
                    type="text"
                    value={value}
                    onChange={event => setValue(event.target.value)}
                    maxLength={MAX_MESSAGE_LENGTH}
                    disabled={!canSend}
                    placeholder={canSend ? t('composer.placeholder') : t('composer.connecting')}
                    aria-label={t('composer.placeholder')}
                    className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
                />

                <button
                    type="submit"
                    disabled={!canSend || !hasSomethingToSend}
                    aria-label={t('composer.send')}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Send className="h-4 w-4" />
                </button>
            </div>

            {/* Only near the limit. The box stops at the limit on its own; this says why. */}
            {value.length >= MESSAGE_COUNTER_FROM && (
                <p aria-live="polite" className="text-right text-xs text-slate-500 dark:text-slate-400">
                    {t('composer.remaining', { count: MAX_MESSAGE_LENGTH - value.length })}
                </p>
            )}
        </form>
    );
}
