'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import type { GolfCourse, TeeTimeSchedule, TeeTimeScheduleInputRaw } from '@/lib/schemas/golf';
import { COMMON_TIME_ZONES } from './timeZones';
import { CourseExtras } from './CourseExtras';

/** Admin-only, so English (CONTEXT.md, "Interface Language"). */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5';

type FieldErrors = Partial<Record<string, string[]>>;
type Reply = { error?: string; fieldErrors?: FieldErrors; generated?: number; data?: GolfCourse };

async function call(url: string, body: Record<string, unknown>) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    return { ok: response.ok, json: json as Reply };
}

function describeDays(days: number[]): string {
    const key = days.join(',');
    if (key === '0,1,2,3,4,5,6') return 'Every day';
    if (key === '1,2,3,4,5') return 'Mon–Fri';
    if (key === '0,6') return 'Sat, Sun';
    return days.map(d => DAYS[d]).join(', ');
}

/**
 * Everything a course needs before customers can book it — its time zone and its tee-time
 * schedules — and, for a draft, the Publish button, which works once both exist (CONTEXT.md,
 * "Golf Course": published means bookable).
 */
export function TeeTimeSchedules({ course, publishHint = false, onChanged }: {
    course: GolfCourse;
    /** Opened from Publish: say what is missing. */
    publishHint?: boolean;
    /** The course list is stale: a time zone was saved or the course was published. */
    onChanged?: () => void;
}) {
    const [timezone, setTimezone] = useState(course.timezone);
    const [status, setStatus] = useState(course.status);
    const [zone, setZone] = useState('');
    const [schedules, setSchedules] = useState<TeeTimeSchedule[] | null>(null);
    const [name, setName] = useState('');
    const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
    const [firstTee, setFirstTee] = useState('06:00');
    const [lastTee, setLastTee] = useState('11:00');
    const [intervalMinutes, setIntervalMinutes] = useState('10');
    const [spots, setSpots] = useState('4');
    const [price, setPrice] = useState('');
    const [errors, setErrors] = useState<FieldErrors>({});
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const load = useCallback(async () => {
        const response = await fetch(`/api/admin/golf-schedules?courseId=${course.id}`);
        const json = await response.json().catch(() => ({}));
        if (!response.ok) toast.error(json.error ?? 'Could not load schedules');
        setSchedules(response.ok ? json.data : []);
    }, [course.id]);

    useEffect(() => {
        if (timezone) void load();
    }, [timezone, load]);

    const error = (field: string) =>
        errors[field]?.[0] ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[field]![0]}</p> : null;
    const label = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300';
    const hint = publishHint && status === 'draft' ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            Add a time zone and at least one schedule to publish this course.
        </p>
    ) : null;

    const saveZone = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setErrors({});
        try {
            const { ok, json } = await call('/api/admin/golf-courses', { action: 'set-timezone', id: course.id, timezone: zone });
            if (!ok) {
                setErrors(json.fieldErrors ?? {});
                toast.error(json.error ?? 'Could not save the time zone');
                return;
            }
            setTimezone(json.data?.timezone ?? zone.trim());
            toast.success('Time zone saved');
            onChanged?.();
        } finally {
            setBusy(false);
        }
    };

    if (!timezone) {
        return (
            <form onSubmit={saveZone} className="flex flex-col gap-4">
                {hint}
                <div>
                    <label htmlFor="schedule-timezone" className={label}>Time zone</label>
                    <input id="schedule-timezone" list="schedule-time-zones" className={`${inputClass} font-mono`}
                        value={zone} onChange={e => setZone(e.target.value)} placeholder="Asia/Manila" />
                    <datalist id="schedule-time-zones">{COMMON_TIME_ZONES.map(z => <option key={z} value={z} />)}</datalist>
                    <p className="mt-1 text-[11px] text-slate-400">Tee times are created on this clock. It can&apos;t change once the course has schedules.</p>
                    {error('timezone')}
                </div>
                <div className="flex justify-end">
                    <button type="submit" disabled={busy || !zone.trim()}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save time zone
                    </button>
                </div>
            </form>
        );
    }

    const add = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setErrors({});
        try {
            const schedule: TeeTimeScheduleInputRaw = {
                name, daysOfWeek: days, firstTee, lastTee,
                intervalMinutes: Number(intervalMinutes), spots: Number(spots), pricePerPlayer: Number(price),
            };
            const { ok, json } = await call('/api/admin/golf-schedules', { action: 'create', courseId: course.id, schedule });
            if (!ok) {
                setErrors(json.fieldErrors ?? {});
                toast.error(json.error ?? 'Could not add the schedule');
                return;
            }
            toast.success(`Schedule added: ${json.generated ?? 0} tee times created`);
            setName('');
            setPrice('');
            await load();
            onChanged?.();
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id: string) => {
        setConfirmDelete(null);
        const { ok, json } = await call('/api/admin/golf-schedules', { action: 'delete', id });
        if (!ok) toast.error(json.error ?? 'Could not delete the schedule');
        else toast.success('Schedule deleted. Tee times with bookings are kept.');
        await load();
        onChanged?.();
    };

    const publish = async () => {
        setBusy(true);
        try {
            const { ok, json } = await call('/api/admin/golf-courses', { action: 'publish', id: course.id });
            if (!ok) {
                toast.error(json.error ?? 'Could not publish the course');
                return;
            }
            setStatus('published');
            toast.success('Course published. Customers can book it now.');
            onChanged?.();
        } finally {
            setBusy(false);
        }
    };

    const ready = (schedules?.length ?? 0) > 0;

    return (
        <div className="flex flex-col gap-5">
            {hint}
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Times are in {timezone}{ready ? ' (locked while the course has schedules)' : ''}. Prices are per player, in {course.currency}. Tee times are created 60 days ahead and topped up daily.
            </p>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
                        <tr>
                            <th className="px-3 py-2 font-medium">Name</th>
                            <th className="px-3 py-2 font-medium">Days</th>
                            <th className="px-3 py-2 font-medium">Tee times</th>
                            <th className="px-3 py-2 font-medium">Spots</th>
                            <th className="px-3 py-2 font-medium">Per player</th>
                            <th className="px-3 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {schedules === null && (
                            <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>
                        )}
                        {schedules?.length === 0 && (
                            <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No schedules yet. Add one below to start selling tee times.</td></tr>
                        )}
                        {schedules?.map(s => (
                            <tr key={s.id} className="border-t border-slate-100 dark:border-white/5">
                                <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{s.name}</td>
                                <td className="px-3 py-2">{describeDays(s.daysOfWeek)}</td>
                                <td className="px-3 py-2 tabular-nums">{s.firstTee}–{s.lastTee}, every {s.intervalMinutes} min</td>
                                <td className="px-3 py-2 tabular-nums">{s.spots}</td>
                                <td className="px-3 py-2 tabular-nums">{course.currency} {s.pricePerPlayer}</td>
                                <td className="px-3 py-2 text-right">
                                    {confirmDelete === s.id ? (
                                        <span className="flex items-center justify-end gap-1">
                                            <span className="text-xs text-slate-500">Delete?</span>
                                            <button type="button" onClick={() => void remove(s.id)} className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">Yes</button>
                                            <button type="button" onClick={() => setConfirmDelete(null)} className="rounded px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-white/10">No</button>
                                        </span>
                                    ) : (
                                        <button type="button" aria-label={`Delete ${s.name}`} title="Delete" onClick={() => setConfirmDelete(s.id)}
                                            className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <form onSubmit={add} className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 dark:border-white/10">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Add a schedule</h3>
                <div>
                    <label htmlFor="schedule-name" className={label}>Name</label>
                    <input id="schedule-name" className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Weekday mornings" />
                    {error('name')}
                </div>
                <fieldset>
                    <legend className={label}>Days</legend>
                    <div className="flex flex-wrap gap-3">
                        {DAYS.map((day, index) => (
                            <label key={day} className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
                                <input type="checkbox" checked={days.includes(index)}
                                    onChange={e => setDays(current => e.target.checked ? [...current, index] : current.filter(d => d !== index))} />
                                {day}
                            </label>
                        ))}
                    </div>
                    {error('daysOfWeek')}
                </fieldset>
                <div className="grid gap-4 sm:grid-cols-5">
                    <div>
                        <label htmlFor="schedule-first" className={label}>First tee</label>
                        <input id="schedule-first" type="time" className={inputClass} value={firstTee} onChange={e => setFirstTee(e.target.value)} />
                        {error('firstTee')}
                    </div>
                    <div>
                        <label htmlFor="schedule-last" className={label}>Last tee</label>
                        <input id="schedule-last" type="time" className={inputClass} value={lastTee} onChange={e => setLastTee(e.target.value)} />
                        {error('lastTee')}
                    </div>
                    <div>
                        <label htmlFor="schedule-interval" className={label}>Every (min)</label>
                        <input id="schedule-interval" type="number" min="5" max="60" className={inputClass} value={intervalMinutes} onChange={e => setIntervalMinutes(e.target.value)} />
                        {error('intervalMinutes')}
                    </div>
                    <div>
                        <label htmlFor="schedule-spots" className={label}>Spots</label>
                        <input id="schedule-spots" type="number" min="1" max="4" className={inputClass} value={spots} onChange={e => setSpots(e.target.value)} />
                        {error('spots')}
                    </div>
                    <div>
                        <label htmlFor="schedule-price" className={label}>Price ({course.currency})</label>
                        <input id="schedule-price" type="number" min="0" step="0.01" className={inputClass} value={price} onChange={e => setPrice(e.target.value)} />
                        {error('pricePerPlayer')}
                    </div>
                </div>
                <div className="flex justify-end">
                    <button type="submit" disabled={busy}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add schedule
                    </button>
                </div>
            </form>

            <CourseExtras courseId={course.id} currency={course.currency} />

            {status === 'draft' ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 dark:border-white/10">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        {ready
                            ? 'Ready: publishing puts this course on the storefront with bookable tee times.'
                            : 'Add at least one schedule to publish this course.'}
                    </p>
                    <button type="button" onClick={() => void publish()} disabled={!ready || busy}
                        className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
                        Publish
                    </button>
                </div>
            ) : (
                <p className="text-sm text-emerald-700 dark:text-emerald-400">Published: customers can book this course.</p>
            )}
        </div>
    );
}
