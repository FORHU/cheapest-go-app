'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import type { GolfCourse, TeeTimeSchedule, TeeTimeScheduleInputRaw } from '@/lib/schemas/golf';

/** Admin-only, so English (CONTEXT.md, "Interface Language"). */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5';

type FieldErrors = Partial<Record<string, string[]>>;

async function call(body: Record<string, unknown>) {
    const response = await fetch('/api/admin/golf-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    return { ok: response.ok, json: json as { error?: string; fieldErrors?: FieldErrors; generated?: number } };
}

function describeDays(days: number[]): string {
    const key = days.join(',');
    if (key === '0,1,2,3,4,5,6') return 'Every day';
    if (key === '1,2,3,4,5') return 'Mon–Fri';
    if (key === '0,6') return 'Sat, Sun';
    return days.map(d => DAYS[d]).join(', ');
}

/** The tee-time schedules of one course: what it sells, when, and at what price. */
export function TeeTimeSchedules({ course }: { course: GolfCourse }) {
    const [schedules, setSchedules] = useState<TeeTimeSchedule[] | null>(null);
    const [name, setName] = useState('');
    const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
    const [firstTee, setFirstTee] = useState('06:00');
    const [lastTee, setLastTee] = useState('11:00');
    const [intervalMinutes, setIntervalMinutes] = useState('10');
    const [spots, setSpots] = useState('4');
    const [price, setPrice] = useState('');
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const load = useCallback(async () => {
        const response = await fetch(`/api/admin/golf-schedules?courseId=${course.id}`);
        const json = await response.json().catch(() => ({}));
        if (!response.ok) toast.error(json.error ?? 'Could not load schedules');
        setSchedules(response.ok ? json.data : []);
    }, [course.id]);

    useEffect(() => {
        if (course.timezone) void load();
    }, [course.timezone, load]);

    if (!course.timezone) {
        return (
            <p className="text-sm text-slate-600 dark:text-slate-300">
                Set this course&apos;s time zone first (Edit course → Time zone). Tee times are created on the course&apos;s own clock.
            </p>
        );
    }

    const add = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setErrors({});
        try {
            const schedule: TeeTimeScheduleInputRaw = {
                name, daysOfWeek: days, firstTee, lastTee,
                intervalMinutes: Number(intervalMinutes), spots: Number(spots), pricePerPlayer: Number(price),
            };
            const { ok, json } = await call({ action: 'create', courseId: course.id, schedule });
            if (!ok) {
                setErrors(json.fieldErrors ?? {});
                toast.error(json.error ?? 'Could not add the schedule');
                return;
            }
            toast.success(`Schedule added: ${json.generated ?? 0} tee times created`);
            setName('');
            setPrice('');
            await load();
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: string) => {
        setConfirmDelete(null);
        const { ok, json } = await call({ action: 'delete', id });
        if (!ok) toast.error(json.error ?? 'Could not delete the schedule');
        else toast.success('Schedule deleted. Tee times with bookings are kept.');
        await load();
    };

    const error = (field: string) =>
        errors[field]?.[0] ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[field]![0]}</p> : null;
    const label = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300';

    return (
        <div className="flex flex-col gap-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">
                Times are in {course.timezone}. Prices are per player, in {course.currency}. Tee times are created 60 days ahead and topped up daily.
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
                    <button type="submit" disabled={saving}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Add schedule
                    </button>
                </div>
            </form>
        </div>
    );
}
