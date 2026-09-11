'use client';

import { useState } from 'react';
import { Loader2, Undo2, UserRound } from 'lucide-react';
import type { AssignableAgentView, SupportRoleView } from './types';

/**
 * Whose this chat is, and — for whoever may — changing it (ADR-0041).
 *
 * An admin assigns and reassigns from a list of everyone who can answer Support Chats. A
 * Support Agent holding the chat may give it back to Unassigned, and only back: they are
 * never offered a colleague's name, because an Agent choosing who gets a chat is exactly the
 * race Assignment by admin exists to end. Everyone else just reads whose it is.
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

    const holder = assignedAdminId === currentAdminId
        ? 'you'
        : assignedAdminName ?? (assignedAdminId ? 'someone' : null);

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

    return (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                <UserRound className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                {holder ? <>Assigned to <strong className="font-medium">{holder}</strong></> : 'Unassigned'}
            </span>

            {currentRole === 'admin' && !resolved && (
                <label className="inline-flex items-center gap-1.5">
                    <span className="sr-only">Assign to</span>
                    <select
                        value=""
                        disabled={busy || agents.length === 0}
                        onChange={event => {
                            if (event.target.value) void call('assign', { toAdminId: event.target.value });
                        }}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                    >
                        <option value="">{assignedAdminId ? 'Reassign to…' : 'Assign to…'}</option>
                        {agents
                            .filter(agent => agent.id !== assignedAdminId)
                            .map(agent => (
                                <option key={agent.id} value={agent.id}>
                                    {agent.id === currentAdminId ? `${agent.name} (you)` : agent.name}
                                    {agent.role === 'admin' ? ' · admin' : ''}
                                </option>
                            ))}
                    </select>
                </label>
            )}

            {currentRole === 'support_agent' && assignedAdminId === currentAdminId && !resolved && (
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void call('return')}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                >
                    <Undo2 className="h-3.5 w-3.5" aria-hidden /> Give back to Unassigned
                </button>
            )}

            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-label="Saving" />}
            {error && <span role="alert" className="text-red-600 dark:text-red-400">{error}</span>}
        </div>
    );
}
