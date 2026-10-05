'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarCheck, Clock, Eye, EyeOff, Flag, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import type { GolfCourse, GolfCourseInputRaw } from '@/lib/schemas/golf';
import type { AdminCoursePage } from '@/lib/server/golf/courses';
import { GolfCourseForm, type FieldErrors } from './GolfCourseForm';
import { TeeTimeSchedules } from './TeeTimeSchedules';

async function call(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/golf-courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    return { ok: response.ok, json: json as { error?: string; fieldErrors?: FieldErrors } };
}

export function GolfCoursesClient({ data, q }: { data: AdminCoursePage; q: string }) {
    const router = useRouter();
    const [search, setSearch] = useState(q);
    /** null = closed, 'new' = creating, a course = editing it. */
    const [editing, setEditing] = useState<GolfCourse | 'new' | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    /** The course whose tee-time schedules are open, if any. */
    const [scheduling, setScheduling] = useState<GolfCourse | null>(null);

    const go = (params: { q?: string; page?: number }) => {
        const next = new URLSearchParams();
        if (params.q) next.set('q', params.q);
        if (params.page && params.page > 1) next.set('page', String(params.page));
        router.push(`/admin/golf${next.size ? `?${next}` : ''}`);
    };

    const save = async (course: GolfCourseInputRaw) => {
        const isNew = editing === 'new';
        const { ok, json } = await call(isNew
            ? { action: 'create', course }
            : { action: 'update', id: (editing as GolfCourse).id, course });
        if (!ok) {
            toast.error(json.error ?? 'Could not save the course');
            return { fieldErrors: json.fieldErrors };
        }
        toast.success(isNew ? 'Course created as a draft' : 'Course saved');
        setEditing(null);
        router.refresh();
    };

    const act = async (body: Record<string, unknown>, done: string) => {
        const { ok, json } = await call(body);
        if (!ok) { toast.error(json.error ?? 'Something went wrong'); return; }
        toast.success(done);
        router.refresh();
    };

    return (
        <div className="flex flex-col gap-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
                        <Flag className="h-5 w-5" /> Golf Courses
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Courses shown on /golf. New courses start as drafts; publish to put them on the storefront.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/admin/golf/bookings"
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
                        <CalendarCheck className="h-4 w-4" /> Bookings
                    </Link>
                    <button type="button" onClick={() => setEditing('new')}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500">
                        <Plus className="h-4 w-4" /> Add course
                    </button>
                </div>
            </header>

            <form onSubmit={e => { e.preventDefault(); go({ q: search.trim() }); }} className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, city or country"
                    aria-label="Search courses"
                    className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm dark:border-white/10 dark:bg-white/5" />
            </form>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
                        <tr>
                            <th className="px-4 py-2 font-medium">Course</th>
                            <th className="px-4 py-2 font-medium">Location</th>
                            <th className="px-4 py-2 font-medium">Holes</th>
                            <th className="px-4 py-2 font-medium">From</th>
                            <th className="px-4 py-2 font-medium">Status</th>
                            <th className="px-4 py-2 text-right font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.courses.length === 0 && (
                            <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                {q ? 'No courses match that search.' : 'No courses yet. Add the first one.'}
                            </td></tr>
                        )}
                        {data.courses.map(course => (
                            <tr key={course.id} className="border-t border-slate-100 dark:border-white/5">
                                <td className="px-4 py-2">
                                    <span className="flex items-center gap-3">
                                        <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-md bg-slate-100 dark:bg-white/10">
                                            {course.imageUrls[0] && <Image src={course.imageUrls[0]} alt="" fill unoptimized className="object-cover" />}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{course.name}</span>
                                            <span className="block truncate font-mono text-xs text-slate-400">/golf/{course.slug}</span>
                                        </span>
                                    </span>
                                </td>
                                <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{course.city}, {course.country}</td>
                                <td className="px-4 py-2 tabular-nums">{course.holes}{course.par ? ` · par ${course.par}` : ''}</td>
                                <td className="px-4 py-2 tabular-nums">{course.greenFeeFrom != null ? `${course.currency} ${course.greenFeeFrom}` : '—'}</td>
                                <td className="px-4 py-2">
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${course.status === 'published'
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                                        : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>
                                        {course.status === 'published' ? 'Published' : 'Draft'}
                                    </span>
                                </td>
                                <td className="px-4 py-2">
                                    <span className="flex items-center justify-end gap-1">
                                        {confirmDelete === course.id ? (
                                            <>
                                                <span className="text-xs text-slate-500">Delete?</span>
                                                <button type="button" className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                                    onClick={() => { setConfirmDelete(null); void act({ action: 'delete', id: course.id }, 'Course deleted'); }}>Yes</button>
                                                <button type="button" className="rounded px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-white/10" onClick={() => setConfirmDelete(null)}>No</button>
                                            </>
                                        ) : (
                                            <>
                                                {course.status === 'published' && (
                                                    <Link href={`/golf/${course.slug}`} target="_blank" className="rounded px-2 py-1 text-xs text-blue-600 hover:underline">View</Link>
                                                )}
                                                <button type="button" aria-label={`Tee times for ${course.name}`} title="Tee times" onClick={() => setScheduling(course)}
                                                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><Clock className="h-4 w-4" /></button>
                                                <button type="button" aria-label={`Edit ${course.name}`} title="Edit" onClick={() => setEditing(course)}
                                                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><Pencil className="h-4 w-4" /></button>
                                                <button type="button"
                                                    aria-label={course.status === 'published' ? `Unpublish ${course.name}` : `Publish ${course.name}`}
                                                    title={course.status === 'published' ? 'Unpublish' : 'Publish'}
                                                    onClick={() => void act(
                                                        { action: course.status === 'published' ? 'unpublish' : 'publish', id: course.id },
                                                        course.status === 'published' ? 'Course unpublished' : 'Course published',
                                                    )}
                                                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
                                                    {course.status === 'published' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                                <button type="button" aria-label={`Delete ${course.name}`} title="Delete" onClick={() => setConfirmDelete(course.id)}
                                                    className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>
                                            </>
                                        )}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {data.totalPages > 1 && (
                <nav className="flex items-center justify-end gap-2 text-sm" aria-label="Pages">
                    <button type="button" disabled={data.page <= 1} onClick={() => go({ q, page: data.page - 1 })}
                        className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40 dark:border-white/10">Previous</button>
                    <span className="text-slate-500">Page {data.page} of {data.totalPages}</span>
                    <button type="button" disabled={data.page >= data.totalPages} onClick={() => go({ q, page: data.page + 1 })}
                        className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-40 dark:border-white/10">Next</button>
                </nav>
            )}

            <Dialog open={editing !== null} onOpenChange={open => { if (!open) setEditing(null); }}>
                <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editing === 'new' ? 'Add golf course' : 'Edit golf course'}</DialogTitle>
                    </DialogHeader>
                    {editing !== null && (
                        <GolfCourseForm
                            key={editing === 'new' ? 'new' : editing.id}
                            initial={editing === 'new' ? undefined : editing}
                            onSubmit={save}
                            onCancel={() => setEditing(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={scheduling !== null} onOpenChange={open => { if (!open) setScheduling(null); }}>
                <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Tee times · {scheduling?.name}</DialogTitle>
                    </DialogHeader>
                    {scheduling && <TeeTimeSchedules key={scheduling.id} course={scheduling} />}
                </DialogContent>
            </Dialog>
        </div>
    );
}
