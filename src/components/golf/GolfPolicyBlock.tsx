import { useTranslations } from 'next-intl';

export type CancelPolicy =
    /** The course page: the rule, before there is a tee time to put a date on. */
    | { kind: 'hours'; hours: number }
    /** A tee time or a booking: the cutoff itself, already formatted on the course's clock. */
    | { kind: 'until'; date: string }
    /** The cutoff has passed, or never fitted before the tee time. */
    | { kind: 'none' };

/**
 * The rules a customer is agreeing to, in one place: shown on the course page, above the
 * payment at checkout and on the booking's own page. It says only what the system does — in
 * particular, never that a booking is instant, because the team confirms with the course first.
 */
export function GolfPolicyBlock({ windowDays, cancel, weatherPolicy }: {
    windowDays?: number;
    cancel: CancelPolicy;
    weatherPolicy: string;
}) {
    const t = useTranslations('golf.policy');
    const cancelText = cancel.kind === 'hours'
        ? t('cancelHours', { hours: cancel.hours })
        : cancel.kind === 'until' ? t('cancelUntil', { date: cancel.date }) : t('cancelNone');
    const items = [
        windowDays != null ? t('window', { days: windowDays }) : null,
        cancelText,
        t('refund'),
        weatherPolicy.trim() ? t('weatherCourse', { rule: weatherPolicy.trim() }) : t('weatherDefault'),
        t('confirmation'),
    ].filter((item): item is string => item !== null);

    return (
        <section aria-labelledby="golf-policy-heading" className="golf-theme border-t-2 border-g-ink pt-3">
            <h2 id="golf-policy-heading" className="font-golf text-xl font-medium tracking-tight text-g-ink">{t('heading')}</h2>
            <ul className="mt-2 divide-y divide-g-rule text-sm leading-relaxed text-g-muted">
                {items.map(item => <li key={item} className="py-2 first:pt-1">{item}</li>)}
            </ul>
        </section>
    );
}
