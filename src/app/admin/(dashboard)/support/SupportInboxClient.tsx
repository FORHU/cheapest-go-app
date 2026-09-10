'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Check, Paperclip, FileText, ImageIcon, X } from 'lucide-react';
import { formatFileSize } from '@/components/support/formatFileSize';
import type { SupportAttachmentView } from '@/components/support/types';
import type {
    ConversationDetail,
    InboxConversation,
    InboxCountsView,
    InboxFilterView,
} from './types';
import { UrgencyBadge } from '@/components/support/UrgencyBadge';
import { UrgencyOverride } from '@/components/support/UrgencyOverride';
import { LinkedBookings } from '@/components/support/LinkedBookings';
import { AgentNotes } from '@/components/support/AgentNotes';

/**
 * The Agent's inbox: the queue on the left, the conversation on the right.
 *
 * Two panes rather than the dialog every other admin screen uses. That convention is for
 * records you glance at; this is work you sit inside for minutes, and losing sight of the
 * queue while you reply is the thing that makes a support tool tiring.
 *
 * The queue is never filtered by brand — see ADR-0030. A AirangGo customer waiting must
 * not be invisible on the CheapestGo admin, because an empty queue and a filtered-away
 * queue look exactly the same.
 */

const TABS: { filter: InboxFilterView; label: string }[] = [
    { filter: 'waiting', label: 'Waiting' },
    { filter: 'mine', label: 'Mine' },
    { filter: 'assistant', label: 'Assistant' },
    { filter: 'resolved', label: 'Resolved' },
];

const EMPTY: Record<InboxFilterView, string> = {
    waiting: 'Nothing waiting. Everyone has been answered.',
    mine: 'You are not handling anything right now.',
    assistant: 'The assistant is not in any conversations.',
    resolved: 'Nothing resolved yet.',
};

interface SupportInboxClientProps {
    initialFilter: InboxFilterView;
    initialConversations: InboxConversation[];
    initialCounts: InboxCountsView;
    /** The signed-in Agent, so their own notes can be told from a colleague's. */
    currentAdminId: string;
}

export function SupportInboxClient({
    initialFilter,
    initialConversations,
    initialCounts,
    currentAdminId,
}: SupportInboxClientProps) {
    const [filter, setFilter] = useState<InboxFilterView>(initialFilter);
    const [conversations, setConversations] = useState(initialConversations);
    const [counts, setCounts] = useState(initialCounts);
    const [openId, setOpenId] = useState<string | null>(null);
    const [detail, setDetail] = useState<ConversationDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [reply, setReply] = useState('');
    const [sending, setSending] = useState(false);
    /** Files this Agent has uploaded and not yet sent. Cleared when the reply goes. */
    const [pendingFiles, setPendingFiles] = useState<SupportAttachmentView[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    const openIdRef = useRef<string | null>(null);
    openIdRef.current = openId;

    const loadList = useCallback(async (next: InboxFilterView) => {
        const response = await fetch(`/api/admin/support/conversations?filter=${next}`);
        if (!response.ok) return;
        const data = await response.json();
        setConversations(data.conversations ?? []);
        setCounts(data.counts ?? { waiting: 0, mine: 0 });
    }, []);

    const loadDetail = useCallback(async (id: string) => {
        setLoadingDetail(true);
        try {
            const response = await fetch(`/api/admin/support/conversations/${id}`);
            if (!response.ok) return;
            setDetail(await response.json());
        } finally {
            setLoadingDetail(false);
        }
    }, []);

    /**
     * One feed for the whole inbox, carrying ids only.
     *
     * The server does not push message bodies down this stream: an Agent needs to know
     * *that* something happened, and the browser then asks for whichever part it is
     * actually showing. See the stream route.
     */
    useEffect(() => {
        if (typeof EventSource === 'undefined') return;
        const source = new EventSource('/api/admin/support/stream');

        source.addEventListener('activity', event => {
            let conversationId: string | undefined;
            try {
                conversationId = JSON.parse((event as MessageEvent).data)?.conversationId;
            } catch {
                return;
            }

            void loadList(filter);
            if (conversationId && conversationId === openIdRef.current) {
                void loadDetail(conversationId);
            }
        });

        return () => source.close();
    }, [filter, loadList, loadDetail]);

    const chooseFilter = (next: InboxFilterView) => {
        setFilter(next);
        setOpenId(null);
        setDetail(null);
        void loadList(next);
    };

    const openConversation = (id: string) => {
        setOpenId(id);
        setDetail(null);
        void loadDetail(id);
    };

    /**
     * Upload a file to the open conversation, before the reply that carries it exists.
     *
     * Same two-step shape as the customer's widget, for the same reason: an Agent attaches
     * a voucher and then writes the sentence explaining it, not the other way round.
     */
    const attach = async (file: File) => {
        if (!openId) return;
        setUploading(true);
        setUploadError(null);

        try {
            const form = new FormData();
            form.append('file', file);

            const response = await fetch(`/api/admin/support/conversations/${openId}/attachments`, {
                method: 'POST',
                body: form,
            });
            const data = (await response.json()) as {
                attachment?: SupportAttachmentView;
                error?: string;
            };

            if (!response.ok || !data.attachment) {
                setUploadError(data.error ?? 'Could not upload that file.');
                return;
            }
            setPendingFiles(current => [...current, data.attachment as SupportAttachmentView]);
        } catch {
            setUploadError('Could not upload that file.');
        } finally {
            setUploading(false);
        }
    };

    const sendReply = async (event: React.FormEvent) => {
        event.preventDefault();
        const body = reply.trim();
        // Words or files: a reply that is only the document the customer asked for is a
        // reply.
        if ((!body && pendingFiles.length === 0) || !openId || sending) return;

        setSending(true);
        try {
            const response = await fetch(`/api/admin/support/conversations/${openId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body, attachmentIds: pendingFiles.map(f => f.id) }),
            });
            if (response.ok) {
                setReply('');
                setPendingFiles([]);
                setUploadError(null);
                await Promise.all([loadDetail(openId), loadList(filter)]);
            }
        } finally {
            setSending(false);
        }
    };

    const resolve = async () => {
        if (!openId) return;
        const response = await fetch(`/api/admin/support/conversations/${openId}/resolve`, {
            method: 'POST',
        });
        if (response.ok) {
            await Promise.all([loadDetail(openId), loadList(filter)]);
        }
    };

    return (
        <div className="flex h-[calc(100dvh-8rem)] flex-col gap-4">
            <header>
                <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Support</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Conversations from the chat widget, across every brand.
                </p>
            </header>

            <nav className="flex flex-wrap gap-1" aria-label="Inbox filters">
                {TABS.map(tab => (
                    <button
                        key={tab.filter}
                        type="button"
                        onClick={() => chooseFilter(tab.filter)}
                        aria-current={filter === tab.filter ? 'page' : undefined}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                            filter === tab.filter
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'
                        }`}
                    >
                        {tab.label}
                        {tab.filter === 'waiting' && counts.waiting > 0 && ` (${counts.waiting})`}
                        {tab.filter === 'mine' && counts.mine > 0 && ` (${counts.mine})`}
                    </button>
                ))}
            </nav>

            <div className="flex min-h-0 flex-1 gap-4">
                <section
                    aria-label="Conversations"
                    className={`min-h-0 w-full overflow-y-auto rounded-xl border border-slate-200 lg:w-80 dark:border-white/10 ${
                        openId ? 'hidden lg:block' : ''
                    }`}
                >
                    {conversations.length === 0 ? (
                        <p className="p-4 text-sm text-slate-500 dark:text-slate-400">{EMPTY[filter]}</p>
                    ) : (
                        <ul>
                            {conversations.map(item => (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        onClick={() => openConversation(item.id)}
                                        className={`w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5 ${
                                            openId === item.id ? 'bg-blue-50 dark:bg-blue-950/30' : ''
                                        }`}
                                    >
                                        <span className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                                {item.guestName ?? 'Signed-in customer'}
                                            </span>
                                            {/*
                                              * Right-aligned so the badges form a column the
                                              * eye can run down, rather than sitting at a
                                              * different offset on every row behind a name.
                                              */}
                                            <UrgencyBadge
                                                urgency={item.urgency}
                                                overridden={item.priority !== null}
                                            />
                                        </span>
                                        <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                            {/*
                                              * Monospaced so a reference a customer reads out
                                              * over the phone can be matched character by
                                              * character against the list.
                                              */}
                                            {/*
                                              * `whitespace-nowrap` because the reference is
                                              * one word to a reader even though the hyphen
                                              * lets the browser break it: in a 20rem column
                                              * it was wrapping to "CS-" / "TW3RZ7", which is
                                              * unreadable precisely when someone is matching
                                              * it against what a customer just read out.
                                              */}
                                            <span className="whitespace-nowrap font-mono">{item.reference}</span>
                                            <span aria-hidden>·</span>
                                            <span>{item.sourceBrand ?? 'CheapestGo'}</span>
                                            <span aria-hidden>·</span>
                                            <span>{new Date(item.lastMessageAt).toLocaleString()}</span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section
                    aria-label="Conversation"
                    className={`flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 dark:border-white/10 ${
                        openId ? '' : 'hidden lg:flex'
                    }`}
                >
                    {!openId && (
                        <p className="p-4 text-sm text-slate-500 dark:text-slate-400">
                            Choose a conversation to read it.
                        </p>
                    )}

                    {openId && loadingDetail && !detail && (
                        <p className="flex items-center gap-2 p-4 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                        </p>
                    )}

                    {detail && (
                        <>
                            <header className="shrink-0 border-b border-slate-200 px-4 py-3 dark:border-white/10">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                            <span className="truncate">
                                                {detail.conversation.guestName ?? 'Signed-in customer'}
                                            </span>
                                            <UrgencyBadge
                                                urgency={detail.conversation.urgency}
                                                overridden={detail.conversation.priority !== null}
                                            />
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            <span className="font-mono">{detail.conversation.reference}</span> ·{' '}
                                            {detail.conversation.guestEmail ?? '—'} ·{' '}
                                            {detail.conversation.sourceBrand ?? 'CheapestGo'} ·{' '}
                                            {detail.conversation.locale}
                                            {detail.conversation.userId ? ' · signed in' : ' · not signed in'}
                                        </p>
                                    </div>
                                    {/*
                                      * Named in full for assistive tech: the "Resolved" tab is
                                      * one word away, and two controls that sound alike is how
                                      * the wrong one gets pressed.
                                      */}
                                    <button
                                        type="button"
                                        onClick={() => void resolve()}
                                        aria-label="Mark conversation resolved"
                                        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                                    >
                                        <Check className="h-3.5 w-3.5" /> Resolve
                                    </button>
                                </div>

                                {/*
                                  * The model's private note. Shown here and nowhere else —
                                  * it is about the customer, not for them.
                                  */}
                                {detail.conversation.escalationReason && (
                                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                                        Handed over because: {detail.conversation.escalationReason}
                                    </p>
                                )}

                                {detail.bookings && detail.bookings.length > 0 && (
                                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                        {detail.bookings.length} booking
                                        {detail.bookings.length === 1 ? '' : 's'} on this account
                                    </p>
                                )}

                                <LinkedBookings
                                    conversationId={detail.conversation.id}
                                    bookings={detail.linkedBookings}
                                    onChanged={() => void loadDetail(detail.conversation.id)}
                                />

                                {/*
                                  * The override, offered as plain words rather than a
                                  * priority dropdown. "Let the dates decide" is a real
                                  * choice and not the same as picking Normal: it hands the
                                  * conversation back to a rule that keeps moving as the
                                  * departure approaches, where Normal freezes it there.
                                  */}
                                <UrgencyOverride
                                    conversationId={detail.conversation.id}
                                    priority={detail.conversation.priority}
                                    onChanged={() => void loadDetail(detail.conversation.id)}
                                />

                                <div className="mt-2">
                                    <AgentNotes
                                        conversationId={detail.conversation.id}
                                        notes={detail.notes}
                                        currentAdminId={currentAdminId}
                                        onChanged={() => void loadDetail(detail.conversation.id)}
                                    />
                                </div>
                            </header>

                            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
                                {detail.messages.map(message => (
                                    <div key={message.id}>
                                        <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                                            {message.senderType}
                                        </span>
                                        <p className="text-sm text-slate-800 dark:text-slate-200">{message.body}</p>

                                        {message.attachments.length > 0 && (
                                            <ul className="mt-1.5 flex flex-col gap-1">
                                                {message.attachments.map(file => {
                                                    const Icon = file.contentType.startsWith('image/')
                                                        ? ImageIcon
                                                        : FileText;
                                                    return (
                                                        <li key={file.id}>
                                                            {/*
                                                              * Links to this app, not to the bucket: the route
                                                              * re-checks the Agent and mints a URL good for a few
                                                              * minutes (ADR-0040). Opened in a new tab so reading
                                                              * an attachment does not lose the queue.
                                                              */}
                                                            <a
                                                                href={`/api/admin/support/conversations/${detail.conversation.id}/attachments/${file.id}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 dark:text-slate-200 dark:ring-white/10 dark:hover:bg-white/10"
                                                            >
                                                                <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                                <span className="max-w-[16rem] truncate">{file.fileName}</span>
                                                                <span className="shrink-0 text-slate-400">
                                                                    {formatFileSize(file.sizeBytes)}
                                                                </span>
                                                            </a>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/*
                              * Never disabled by status. Replying to a chat the assistant is
                              * handling is a Takeover, and catching a wrong answer is the
                              * reason the Assistant tab exists at all.
                              */}
                            <form
                                onSubmit={sendReply}
                                className="flex shrink-0 flex-col gap-2 border-t border-slate-200 px-4 py-3 dark:border-white/10"
                            >
                                {pendingFiles.length > 0 && (
                                    <ul className="flex flex-wrap gap-2">
                                        {pendingFiles.map(file => (
                                            <li
                                                key={file.id}
                                                className="flex items-center gap-1.5 rounded-md bg-slate-100 py-1 pl-2 pr-1 text-xs text-slate-700 dark:bg-white/10 dark:text-slate-200"
                                            >
                                                <span className="max-w-[12rem] truncate">{file.fileName}</span>
                                                <span className="text-slate-400">{formatFileSize(file.sizeBytes)}</span>
                                                <button
                                                    type="button"
                                                    aria-label={`Remove ${file.fileName}`}
                                                    onClick={() =>
                                                        setPendingFiles(current =>
                                                            current.filter(f => f.id !== file.id),
                                                        )
                                                    }
                                                    className="rounded p-0.5 text-slate-500 transition hover:bg-slate-200 dark:hover:bg-white/10"
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
                                <input
                                    ref={fileInput}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif,image/heic,application/pdf"
                                    className="hidden"
                                    tabIndex={-1}
                                    onChange={event => {
                                        const file = event.target.files?.[0];
                                        if (file) void attach(file);
                                        event.target.value = '';
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInput.current?.click()}
                                    disabled={uploading}
                                    aria-label={uploading ? 'Uploading' : 'Attach a file'}
                                    title="Attach a file"
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-white/10"
                                >
                                    <Paperclip className={uploading ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
                                </button>
                                <input
                                    type="text"
                                    value={reply}
                                    onChange={event => setReply(event.target.value)}
                                    placeholder="Reply to the customer"
                                    aria-label="Reply to the customer"
                                    className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm dark:border-white/10 dark:bg-white/5"
                                />
                                <button
                                    type="submit"
                                    disabled={sending || (!reply.trim() && pendingFiles.length === 0)}
                                    className="flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
                                >
                                    <Send className="h-4 w-4" /> Send
                                </button>
                                </div>
                            </form>
                        </>
                    )}
                </section>
            </div>
        </div>
    );
}
