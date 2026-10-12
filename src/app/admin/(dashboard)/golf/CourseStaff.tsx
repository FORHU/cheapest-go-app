'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import type { CourseInvitation } from '@/lib/schemas/golfStaff';
import type { CourseStaffMember } from '@/lib/server/golf/staff';

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-100';

const STATE_STYLE: Record<CourseInvitation['state'], string> = {
    pending: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    accepted: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    revoked: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
    expired: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
};

async function call(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/golf-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
        body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    return { ok: response.ok, json: json as { error?: string } };
}

/**
 * Who acts for one course. An admin invites by email (the person signs in with that address and
 * accepts) or removes someone; requests that arrive on their own are decided under Requests.
 */
export function CourseStaff({ courseId, courseName }: { courseId: string; courseName: string }) {
    const [staff, setStaff] = useState<CourseStaffMember[] | null>(null);
    const [invitations, setInvitations] = useState<CourseInvitation[]>([]);
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const response = await fetch(`/api/admin/golf-staff?courseId=${courseId}`);
            if (!response.ok) throw new Error(String(response.status));
            const json = await response.json();
            setStaff(json.data.staff);
            setInvitations(json.data.invitations);
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, [courseId]);

    useEffect(() => { void load(); }, [load]);

    const invite = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        const { ok, json } = await call({ action: 'invite', courseId, email });
        setBusy(false);
        if (!ok) { toast.error(json.error ?? 'Could not send the invitation'); return; }
        toast.success(`Invitation sent to ${email.trim().toLowerCase()}`);
        setEmail('');
        void load();
    };

    const act = async (body: Record<string, unknown>, done: string) => {
        const { ok, json } = await call(body);
        if (!ok) { toast.error(json.error ?? 'Something went wrong'); return; }
        toast.success(done);
        setConfirmRemove(null);
        void load();
    };

    return (
        <div className="flex flex-col gap-6">
            <p className="text-sm text-slate-500 dark:text-slate-400">
                People who can confirm or decline tee-time requests for {courseName}. They see this course only.
            </p>

            <form onSubmit={invite} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="flex-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                    Invite by email
                    <input type="email" required className={`${inputClass} mt-1`} value={email} placeholder="pro-shop@club.example"
                        onChange={e => setEmail(e.target.value)} />
                </label>
                <button type="submit" disabled={busy}
                    className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Send invitation
                </button>
            </form>

            {failed && <p role="alert" className="text-sm text-red-600 dark:text-red-400">Could not load this course&apos;s staff. Please try again.</p>}

            <section aria-label="Current staff">
                <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Current staff</h3>
                {staff === null && !failed && <p className="text-sm text-slate-500">Loading…</p>}
                {staff?.length === 0 && <p className="text-sm text-slate-500">Nobody yet. Send an invitation, or approve a request.</p>}
                <ul className="divide-y divide-slate-100 dark:divide-white/5">
                    {staff?.map(member => (
                        <li key={member.userId} className="flex items-center justify-between gap-3 py-2 text-sm">
                            <span className="min-w-0">
                                <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{member.name || member.email}</span>
                                {member.name && <span className="block truncate text-xs text-slate-500">{member.email}</span>}
                            </span>
                            {confirmRemove === member.userId ? (
                                <span className="flex items-center gap-1">
                                    <span className="text-xs text-slate-500">Remove?</span>
                                    <button type="button" className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                        onClick={() => void act({ action: 'remove', userId: member.userId, courseId }, 'Removed from the course')}>Yes</button>
                                    <button type="button" className="rounded px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-white/10"
                                        onClick={() => setConfirmRemove(null)}>No</button>
                                </span>
                            ) : (
                                <button type="button" aria-label={`Remove ${member.email}`} title="Remove"
                                    onClick={() => setConfirmRemove(member.userId)}
                                    className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30">
                                    <UserMinus className="h-4 w-4" />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            </section>

            {invitations.length > 0 && (
                <section aria-label="Invitations">
                    <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Invitations</h3>
                    <ul className="divide-y divide-slate-100 dark:divide-white/5">
                        {invitations.map(inv => (
                            <li key={inv.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                                <span className="min-w-0 truncate text-slate-900 dark:text-slate-100">{inv.email}</span>
                                <span className="flex items-center gap-2">
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATE_STYLE[inv.state]}`}>{inv.state}</span>
                                    {inv.state === 'pending' && (
                                        <button type="button" className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                                            onClick={() => void act({ action: 'revoke_invitation', id: inv.id }, 'Invitation withdrawn')}>
                                            Withdraw
                                        </button>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
