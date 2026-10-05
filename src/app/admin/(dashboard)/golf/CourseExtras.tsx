'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
    EXTRA_NAMES_EN, EXTRA_UNITS_EN, GOLF_EXTRAS, type ExtraOffer, type GolfExtraCode,
} from '@/lib/golf/extras';

/** Admin-only, so English (CONTEXT.md, "Interface Language"). */

type Row = { offered: boolean; price: string };
type Rows = Record<GolfExtraCode, Row>;

const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-white/10 dark:bg-white/5';

/** What customers can add to a tee time at this course, at a price per item. */
export function CourseExtras({ courseId, currency }: { courseId: string; currency: string }) {
    const [rows, setRows] = useState<Rows | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/admin/golf-extras?courseId=${courseId}`)
            .then(response => response.json())
            .then((json: { data?: ExtraOffer[] }) => {
                if (cancelled) return;
                setRows(Object.fromEntries(GOLF_EXTRAS.map(code => {
                    const offer = json.data?.find(o => o.code === code);
                    return [code, { offered: Boolean(offer), price: offer ? String(offer.price) : '' }];
                })) as Rows);
            })
            .catch(() => { if (!cancelled) toast.error('Could not load extras'); });
        return () => { cancelled = true; };
    }, [courseId]);

    if (!rows) return <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Loading extras" />;

    const update = (code: GolfExtraCode, change: Partial<Row>) => setRows({ ...rows, [code]: { ...rows[code], ...change } });

    const save = async () => {
        setSaving(true);
        try {
            const extras = GOLF_EXTRAS
                .filter(code => rows[code].offered)
                .map(code => ({ code, price: Number(rows[code].price) }));
            const response = await fetch('/api/admin/golf-extras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ courseId, extras }),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok) {
                toast.error(json.error ?? 'Could not save extras');
                return;
            }
            toast.success('Extras saved');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-white/10">
            <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Extras</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Customers can add these to a tee time, up to one per player. Prices are per item, in {currency}. A fee the course always charges belongs in the tee-time price.
                </p>
            </div>
            {GOLF_EXTRAS.map(code => (
                <div key={code} className="grid grid-cols-[1fr_9rem] items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <input type="checkbox" aria-label={`Offer ${EXTRA_NAMES_EN[code]}`} checked={rows[code].offered}
                            onChange={e => update(code, { offered: e.target.checked })} />
                        {EXTRA_NAMES_EN[code]} <span className="text-xs text-slate-400">{EXTRA_UNITS_EN[code]}</span>
                    </label>
                    <input type="number" min="0" step="0.01" aria-label={`${EXTRA_NAMES_EN[code]} price`}
                        disabled={!rows[code].offered} value={rows[code].price}
                        onChange={e => update(code, { price: e.target.value })} className={inputClass} />
                </div>
            ))}
            <div className="flex justify-end">
                <button type="button" onClick={() => void save()} disabled={saving}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save extras
                </button>
            </div>
        </section>
    );
}
