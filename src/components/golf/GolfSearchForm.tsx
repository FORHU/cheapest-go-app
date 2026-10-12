import { useTranslations } from 'next-intl';
import { DEFAULT_PLAYERS, type GolfSearchParams } from '@/lib/golf/search';

const fieldClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-100';

/**
 * A plain GET form: the state lives in the URL, so a search can be linked, reloaded and read by
 * the server with no client code. Country is carried through as a hidden field.
 */
export function GolfSearchForm({ params }: { params: GolfSearchParams }) {
    const t = useTranslations('golf.search');
    const label = 'text-xs font-medium text-slate-600 dark:text-slate-300';
    const filtered = Boolean(params.date || params.from || params.to || params.players !== DEFAULT_PLAYERS);

    return (
        <form method="get" action="/golf" role="search" aria-label={t('filtersLabel')}
            className="mt-6 grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-[1fr_6rem_1fr_1fr_auto] dark:border-white/10">
            {params.country && <input type="hidden" name="country" value={params.country} />}
            <label className={label}>
                {t('date')}
                <input name="date" type="date" defaultValue={params.date ?? ''} className={fieldClass} />
            </label>
            <label className={label}>
                {t('players')}
                <select name="players" defaultValue={params.players} className={fieldClass}>
                    {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
            </label>
            <label className={label}>
                {t('from')}
                <input name="from" type="time" defaultValue={params.from ?? ''} className={fieldClass} />
            </label>
            <label className={label}>
                {t('to')}
                <input name="to" type="time" defaultValue={params.to ?? ''} className={fieldClass} />
            </label>
            <div className="flex items-end gap-2">
                <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">{t('submit')}</button>
                {filtered && (
                    <a href={params.country ? `/golf?country=${encodeURIComponent(params.country)}` : '/golf'}
                        className="py-2 text-sm text-slate-600 hover:underline dark:text-slate-300">{t('reset')}</a>
                )}
            </div>
        </form>
    );
}
