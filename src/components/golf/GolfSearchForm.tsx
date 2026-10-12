import { useTranslations } from 'next-intl';
import { DEFAULT_PLAYERS, type GolfSearchParams } from '@/lib/golf/search';

const fieldClass = 'mt-1 w-full rounded-none border-0 border-b border-g-rule bg-transparent px-0 py-1.5 text-base text-g-ink transition-colors focus:border-g-accent focus:outline-none focus-visible:outline-none tabular-nums';

/**
 * A plain GET form: the state lives in the URL, so a search can be linked, reloaded and read by
 * the server with no client code. Country is carried through as a hidden field. One ruled strip
 * rather than a box of fields.
 */
export function GolfSearchForm({ params }: { params: GolfSearchParams }) {
    const t = useTranslations('golf.search');
    const label = 'text-xs font-medium text-g-muted';
    const filtered = Boolean(params.date || params.from || params.to || params.players !== DEFAULT_PLAYERS);

    return (
        <form method="get" action="/golf" role="search" aria-label={t('filtersLabel')}
            className="golf-theme mt-8 grid gap-x-6 gap-y-4 border-y border-g-ink py-5 sm:grid-cols-[1.4fr_5rem_1fr_1fr_auto] sm:items-end">
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
            <div className="flex items-center gap-4">
                <button type="submit"
                    className="rounded-sm bg-g-accent px-6 py-2.5 text-sm font-semibold text-g-accent-ink transition duration-200 hover:bg-g-accent-hover motion-safe:active:scale-[0.98]">
                    {t('submit')}
                </button>
                {filtered && (
                    <a href={params.country ? `/golf?country=${encodeURIComponent(params.country)}` : '/golf'}
                        className="text-sm text-g-muted underline-offset-4 hover:text-g-ink hover:underline">{t('reset')}</a>
                )}
            </div>
        </form>
    );
}
