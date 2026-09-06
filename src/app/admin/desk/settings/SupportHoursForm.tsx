'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * When the desk is open.
 *
 * Until now this could only be changed with raw SQL. It governs what a customer is told
 * when they ask for a person outside hours — not whether they can, which is why editing it
 * is safe: the worst a wrong schedule does is promise the wrong morning.
 */

interface Window { open: string; close: string }

type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface HoursValue {
    timezone: string;
    days: Partial<Record<Day, Window | null>>;
}

const DAYS: { key: Day; label: string }[] = [
    { key: 'mon', label: 'Monday' },
    { key: 'tue', label: 'Tuesday' },
    { key: 'wed', label: 'Wednesday' },
    { key: 'thu', label: 'Thursday' },
    { key: 'fri', label: 'Friday' },
    { key: 'sat', label: 'Saturday' },
    { key: 'sun', label: 'Sunday' },
];

/** Matches the list the platform settings page offers, so the two agree. */
const TIMEZONES = [
    'Asia/Manila', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Singapore',
    'America/New_York', 'America/Los_Angeles',
    'Europe/London', 'Europe/Paris', 'Australia/Sydney',
];

const DEFAULT_WINDOW: Window = { open: '09:00', close: '18:00' };

export function SupportHoursForm({ initialHours }: { initialHours: HoursValue }) {
    const [timezone, setTimezone] = useState(initialHours.timezone);

    /*
     * Times are kept for every day, open or closed, with `open` as the separate flag.
     *
     * Closing a day and reopening it must not lose what was typed — discovering 00:00
     * where you left 09:00 is how a schedule quietly becomes wrong.
     */
    const [days, setDays] = useState<Record<Day, { open: boolean; window: Window }>>(() => {
        const initial = {} as Record<Day, { open: boolean; window: Window }>;
        for (const { key } of DAYS) {
            const existing = initialHours.days[key];
            initial[key] = { open: Boolean(existing), window: existing ?? DEFAULT_WINDOW };
        }
        return initial;
    });

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const setWindow = (day: Day, field: keyof Window, value: string) => {
        setDays(current => ({
            ...current,
            [day]: { ...current[day], window: { ...current[day].window, [field]: value } },
        }));
        setSaved(false);
    };

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        setSaved(false);

        // The whole week every time. A partial update leaves half the schedule as what you
        // meant and half as what was there, with nothing on screen saying which is which.
        const payload: HoursValue = {
            timezone,
            days: Object.fromEntries(
                DAYS.map(({ key }) => [key, days[key].open ? days[key].window : null]),
            ) as HoursValue['days'],
        };

        try {
            const response = await fetch('/api/admin/support/hours', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hours: payload }),
            });
            const data = await response.json();

            if (!response.ok) {
                // The server names the day and the problem; that is the useful part.
                setError(data.error ?? 'Could not save the hours.');
                return;
            }
            setSaved(true);
        } catch {
            setError('Could not reach the server.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={save} className="max-w-2xl space-y-6">
            <header>
                <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Support hours</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    When someone is available to take an escalated chat. Outside these hours the
                    assistant still answers, and a customer asking for a person is still queued —
                    they are just told when the team is back.
                </p>
            </header>

            <label className="block">
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
                    Timezone
                </span>
                <select
                    value={timezone}
                    onChange={event => { setTimezone(event.target.value); setSaved(false); }}
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-white/5"
                >
                    {TIMEZONES.map(zone => <option key={zone} value={zone}>{zone}</option>)}
                </select>
            </label>

            <ul className="space-y-2">
                {DAYS.map(({ key, label }) => (
                    <li
                        key={key}
                        className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10"
                    >
                        <label className="flex w-36 items-center gap-2">
                            <input
                                type="checkbox"
                                checked={days[key].open}
                                aria-label={`${label} open`}
                                onChange={event => {
                                    setDays(current => ({
                                        ...current,
                                        [key]: { ...current[key], open: event.target.checked },
                                    }));
                                    setSaved(false);
                                }}
                            />
                            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                {label}
                            </span>
                        </label>

                        {days[key].open ? (
                            <div className="flex items-center gap-2">
                                <input
                                    type="time"
                                    value={days[key].window.open}
                                    aria-label={`${label} opens`}
                                    onChange={event => setWindow(key, 'open', event.target.value)}
                                    className="h-8 rounded-lg border border-slate-200 px-2 text-sm dark:border-white/10 dark:bg-white/5"
                                />
                                <span className="text-slate-400">to</span>
                                <input
                                    type="time"
                                    value={days[key].window.close}
                                    aria-label={`${label} closes`}
                                    onChange={event => setWindow(key, 'close', event.target.value)}
                                    className="h-8 rounded-lg border border-slate-200 px-2 text-sm dark:border-white/10 dark:bg-white/5"
                                />
                            </div>
                        ) : (
                            <span className="text-sm text-slate-400">Closed</span>
                        )}
                    </li>
                ))}
            </ul>

            {error && (
                <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                    {error}
                </p>
            )}
            {saved && (
                <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                    Saved.
                </p>
            )}

            <button
                type="submit"
                disabled={saving}
                className="flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save hours
            </button>
        </form>
    );
}
