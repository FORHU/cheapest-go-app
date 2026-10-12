'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronLeft, Check, Loader2, X } from 'lucide-react';
import type { CourseRequest } from '@/lib/schemas/golfStaff';

type Tab = 'pending' | 'approved' | 'rejected';
interface ListedCourse { id: string; name: string; city: string; country: string }

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-100';

const date = (iso: string) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(iso));

/** Decides requests to list or claim a course. Approving attaches the requester to the course. */
export function GolfRequestsClient({ pending, approved, rejected, courses }: {
    pending: CourseRequest[];
    approved: CourseRequest[];
    rejected: CourseRequest[];
    courses: ListedCourse[];
}) {
    const router = useRouter();
    const [tab, setTab] = useState<Tab>('pending');
    const [busy, setBusy] = useState<string | null>(null);
    /** Per request: the course chosen to attach to ('' = what they asked for) and a note. */
    const [choice, setChoice] = useState<Record<string, string>>({});
    const [notes, setNotes] = useState<Record<string, string>>({});

    const lists: Record<Tab, CourseRequest[]> = { pending, approved, rejected };
    const shown = lists[tab];

    const decide = async (request: CourseRequest, action: 'approve' | 'reject') => {
        setBusy(request.id);
        try {
            const response = await fetch('/api/admin/golf-course-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({
                    action, id: request.id, note: notes[request.id] ?? '',
                    ...(action === 'approve' && choice[request.id] ? { courseId: choice[request.id] } : {}),
                }),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok) { toast.error(json.error ?? 'Something went wrong'); return; }
            toast.success(action === 'approve'
                ? (json.data?.createdCourse ? 'Approved. A draft course was created.' : 'Approved')
                : 'Rejected');
            router.refresh();
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <header>
                <Link href="/admin/golf" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                    <ChevronLeft className="h-4 w-4" /> Golf courses
                </Link>
                <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Course requests</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    People asking to list a course, or to claim one that is already listed. Approving attaches them to the
                    course so they can confirm its tee-time requests.
                </p>
            </header>

            <div role="tablist" aria-label="Requests" className="flex gap-1 border-b border-slate-200 dark:border-white/10">
                {(['pending', 'approved', 'rejected'] as const).map(t => (
                    <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                        className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize ${tab === t
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                        {t} <span className="tabular-nums text-xs">({lists[t].length})</span>
                    </button>
                ))}
            </div>

            {shown.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                    {tab === 'pending' ? 'No requests are waiting.' : `No ${tab} requests.`}
                </p>
            ) : (
                <ul className="flex flex-col gap-3">
                    {shown.map(r => (
                        <li key={r.id} className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-medium text-slate-900 dark:text-slate-100">{r.courseName}</p>
                                    <p className="text-sm text-slate-500">{r.city}, {r.country}</p>
                                </div>
                                <span className="text-xs text-slate-500">{date(r.createdAt)}</span>
                            </div>

                            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                                <div><dt className="inline text-slate-500">From </dt><dd className="inline text-slate-900 dark:text-slate-100">{r.contactName} · {r.contactEmail}</dd></div>
                                <div>
                                    <dt className="inline text-slate-500">Asks for </dt>
                                    <dd className="inline text-slate-900 dark:text-slate-100">
                                        {r.existingCourseName ? `to claim ${r.existingCourseName}` : 'a new listing'}
                                    </dd>
                                </div>
                            </dl>
                            {r.message && <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-white/5 dark:text-slate-300">{r.message}</p>}

                            {r.status === 'pending' ? (
                                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                        Attach to
                                        <select className={`${inputClass} mt-1`} value={choice[r.id] ?? ''}
                                            onChange={e => setChoice(c => ({ ...c, [r.id]: e.target.value }))}>
                                            <option value="">{r.existingCourseName ?? 'A new draft course'}</option>
                                            {courses.filter(c => c.id !== r.existingCourseId).map(c => (
                                                <option key={c.id} value={c.id}>{c.name} — {c.city}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                        Note to the requester (optional)
                                        <input className={`${inputClass} mt-1`} maxLength={500} value={notes[r.id] ?? ''}
                                            onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))} />
                                    </label>
                                    <div className="flex gap-2">
                                        <button type="button" disabled={busy === r.id} onClick={() => decide(r, 'approve')}
                                            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                                            {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
                                        </button>
                                        <button type="button" disabled={busy === r.id} onClick={() => decide(r, 'reject')}
                                            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
                                            <X className="h-4 w-4" /> Reject
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-3 text-sm text-slate-500">
                                    {r.status === 'approved' ? 'Approved' : 'Rejected'}{r.decidedAt ? ` ${date(r.decidedAt)}` : ''}
                                    {r.decisionNote ? ` · ${r.decisionNote}` : ''}
                                </p>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
