import { useTranslations } from 'next-intl';
import { DEFAULT_PLAYERS, type GolfSearchParams } from '@/lib/golf/search';
import { GolfDatePicker } from './GolfDatePicker';
import { GolfPlayersField } from './GolfPlayersField';
import { GolfSelect, type GolfSelectOption } from './GolfSelect';

/** 05:00 to 19:30 in half-hours: the span tee sheets actually run in. */
const SLOTS = Array.from({ length: 30 }, (_, i) => {
    const minutes = 5 * 60 + i * 30;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

/**
 * A plain GET form: the state lives in the URL, so a search can be linked, reloaded and read by
 * the server with no client code of its own. The date, the time dropdowns and the party size
 * are controls that write into the form, so it submits exactly as a native one would. Country
 * is carried through as a hidden field. One ruled strip rather than a box of fields.
 */
export function GolfSearchForm({ params }: { params: GolfSearchParams }) {
    const t = useTranslations('golf.search');
    const filtered = Boolean(params.date || params.from || params.to || params.players !== DEFAULT_PLAYERS);

    // A time that came in on the URL but is not on the half-hour grid still shows as chosen.
    const timeOptions = (current?: string): GolfSelectOption[] => [
        { value: '', label: t('anyTime') },
        ...(current && !SLOTS.includes(current) ? [{ value: current, label: current }] : []),
        ...SLOTS.map(slot => ({ value: slot, label: slot })),
    ].sort((a, b) => (a.value === '' ? -1 : b.value === '' ? 1 : a.value.localeCompare(b.value)));

    return (
        <form method="get" action="/golf" role="search" aria-label={t('filtersLabel')}
            className="golf-theme mt-8 grid gap-x-8 gap-y-5 border-y border-g-ink py-6 sm:grid-cols-2 lg:grid-cols-[1.25fr_auto_1fr_1fr_auto] lg:items-end">
            {params.country && <input type="hidden" name="country" value={params.country} />}
            <GolfDatePicker label={t('date')} name="date" defaultValue={params.date ?? ''}
                placeholder={t('anyDate')} clearLabel={t('anyDate')} />
            <GolfPlayersField label={t('players')} name="players" defaultValue={params.players} />
            <GolfSelect label={t('from')} name="from" defaultValue={params.from ?? ''} options={timeOptions(params.from)} mono />
            <GolfSelect label={t('to')} name="to" defaultValue={params.to ?? ''} options={timeOptions(params.to)} mono />
            <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-1">
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
