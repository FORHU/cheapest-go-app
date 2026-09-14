'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Search, Undo2 } from 'lucide-react';
import type { AssignableAgentView, SupportRoleView } from './types';

/**
 * Whose this chat is, and — for whoever may — changing it (ADR-0041).
 *
 * An admin assigns and reassigns from a list of everyone who can answer Support Chats. A
 * Support Agent holding the chat may give it back to Unassigned, and only back: they are
 * never offered a colleague's name, because an Agent choosing who gets a chat is exactly the
 * race Assignment by admin exists to end. Everyone else just reads whose it is.
 *
 * The picker is its own listbox rather than a native <select>. A select sizes itself to its
 * longest option, and a display name is whatever someone typed: on 2026-09-14 one account's
 * name was a paragraph of lorem ipsum, and the select pushed the whole conversation pane past
 * the edge of the screen. Here every name is truncated to the width it is given.
 */
export function AssignmentControls({
    conversationId,
    assignedAdminId,
    assignedAdminName,
    resolved,
    currentAdminId,
    currentRole,
    agents,
    onChanged,
}: {
    conversationId: string;
    assignedAdminId: string | null;
    assignedAdminName: string | null | undefined;
    resolved: boolean;
    currentAdminId: string;
    currentRole: SupportRoleView;
    /** Loaded for admins only; empty for a Support Agent, who is never offered it. */
    agents: AssignableAgentView[];
    onChanged: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const holderName = assignedAdminId === currentAdminId
        ? 'You'
        : assignedAdminName ?? (assignedAdminId ? 'Someone' : null);

    const call = async (path: string, body?: unknown) => {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch(`/api/admin/support/conversations/${conversationId}/${path}`, {
                method: 'POST',
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined,
            });
            if (!response.ok) {
                const data = (await response.json().catch(() => ({}))) as { error?: string };
                setError(data.error ?? 'That did not work.');
                return;
            }
            onChanged();
        } catch {
            setError('That did not work.');
        } finally {
            setBusy(false);
        }
    };

    const canAssign = currentRole === 'admin' && !resolved;
    const canGiveBack = currentRole === 'support_agent' && assignedAdminId === currentAdminId && !resolved;

    return (
        <div className="flex min-w-0 flex-col gap-2 text-xs">
            {canAssign ? (
                <AgentPicker
                    agents={agents}
                    assignedAdminId={assignedAdminId}
                    holderName={holderName}
                    currentAdminId={currentAdminId}
                    busy={busy}
                    onPick={id => void call('assign', { toAdminId: id })}
                />
            ) : (
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 dark:border-white/10">
                    <Initials name={holderName} />
                    <span className="min-w-0 truncate text-sm text-slate-700 dark:text-slate-200" title={holderName ?? undefined}>
                        {holderName ?? 'Unassigned'}
                    </span>
                </div>
            )}

            {canGiveBack && (
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void call('return')}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                >
                    <Undo2 className="h-3.5 w-3.5" aria-hidden /> Give back to Unassigned
                </button>
            )}

            {busy && !canAssign && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-label="Saving" />}
            {error && <span role="alert" className="text-red-600 dark:text-red-400">{error}</span>}
        </div>
    );
}

/** A round badge with someone's initials — a face for a name in a narrow column. */
function Initials({ name }: { name: string | null }) {
    const letters = name
        ? name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('')
        : '';
    return (
        <span
            aria-hidden
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                name
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'border border-dashed border-slate-300 text-slate-400 dark:border-white/20'
            }`}
        >
            {letters}
        </span>
    );
}

/** Beyond this many people the list gets a search box. */
const SEARCH_FROM = 7;

function AgentPicker({
    agents,
    assignedAdminId,
    holderName,
    currentAdminId,
    busy,
    onPick,
}: {
    agents: AssignableAgentView[];
    assignedAdminId: string | null;
    holderName: string | null;
    currentAdminId: string;
    busy: boolean;
    onPick: (id: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const listId = useId();

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? agents.filter(agent => agent.name.toLowerCase().includes(q)) : agents;
    }, [agents, query]);

    // Close on a click outside, the way the app's other dropdowns do.
    useEffect(() => {
        if (!open) return;
        const onDown = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        setActive(0);
        if (agents.length >= SEARCH_FROM) searchRef.current?.focus();
        else listRef.current?.focus();
    }, [open, agents.length]);

    const choose = (agent: AssignableAgentView) => {
        setOpen(false);
        setQuery('');
        if (agent.id !== assignedAdminId) onPick(agent.id);
    };

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') { setOpen(false); return; }
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => Math.min(i + 1, visible.length - 1)); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
        if (event.key === 'Enter' && visible[active]) { event.preventDefault(); choose(visible[active]); }
    };

    return (
        <div ref={rootRef} className="relative min-w-0" onKeyDown={onKeyDown}>
            <button
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                aria-label={assignedAdminId ? 'Reassign to' : 'Assign to'}
                disabled={busy || agents.length === 0}
                onClick={() => setOpen(v => !v)}
                className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
            >
                <Initials name={holderName} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-800 dark:text-slate-100" title={holderName ?? undefined}>
                        {holderName ?? 'Unassigned'}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                        {assignedAdminId ? 'Reassign to…' : 'Assign to…'}
                    </span>
                </span>
                {busy
                    ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" aria-hidden />
                    : <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
            </button>

            {open && (
                <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
                    {agents.length >= SEARCH_FROM && (
                        <label className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-white/5">
                            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={event => { setQuery(event.target.value); setActive(0); }}
                                placeholder="Find someone"
                                aria-label="Find someone"
                                className="w-full min-w-0 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
                            />
                        </label>
                    )}
                    <ul
                        ref={listRef}
                        id={listId}
                        role="listbox"
                        tabIndex={-1}
                        aria-label="People who can take this chat"
                        className="max-h-64 overflow-y-auto p-1 outline-none"
                    >
                        {visible.length === 0 && (
                            <li className="px-3 py-2 text-xs text-slate-400">Nobody matches.</li>
                        )}
                        {visible.map((agent, index) => {
                            const selected = agent.id === assignedAdminId;
                            const label = agent.id === currentAdminId ? `${agent.name} (you)` : agent.name;
                            return (
                                <li
                                    key={agent.id}
                                    role="option"
                                    aria-selected={selected}
                                    onMouseEnter={() => setActive(index)}
                                    onClick={() => choose(agent)}
                                    className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 ${
                                        index === active ? 'bg-slate-100 dark:bg-white/10' : ''
                                    }`}
                                >
                                    <Initials name={agent.name} />
                                    <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-100" title={label}>
                                        {label}
                                    </span>
                                    {agent.role === 'admin' && (
                                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-400">
                                            Admin
                                        </span>
                                    )}
                                    {selected && <Check className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
