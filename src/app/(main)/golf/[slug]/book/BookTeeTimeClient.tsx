'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import StripeEmbeddedCheckout from '@/components/checkout/StripeEmbeddedCheckout';
import { GolfPolicyBlock, type CancelPolicy } from '@/components/golf/GolfPolicyBlock';
import { GolfSelect } from '@/components/golf/GolfSelect';
import { formatExtrasParam, type GolfExtraCode } from '@/lib/golf/extras';

export interface TeeTimeSummary {
    courseName: string;
    courseHref: string;
    date: string;
    time: string;
    greenFeeLabel: string;
    greenFee: string;
    /** One line per chosen extra. */
    extraLines: { label: string; amount: string }[];
    serviceFee: string;
    total: string;
}

export interface ExtraOption {
    code: GolfExtraCode;
    name: string;
    /** "$45.00 each" */
    each: string;
    quantity: number;
}

/**
 * Extras, the lead player's name, then the card. Choosing an extra changes the URL so the server
 * prices the whole booking again; the card is authorised, not charged, until the team confirms
 * with the course (CONTEXT.md, "Golf Booking").
 */
export function BookTeeTimeClient({ teeTimeId, players, bookPath, extras, summary, policy, currency, displayedTotal }: {
    teeTimeId: string;
    players: number;
    bookPath: string;
    extras: ExtraOption[];
    summary: TeeTimeSummary;
    /** The currency this page priced in and the total it showed, so the hold can be held to them. */
    currency?: string;
    displayedTotal?: number;
    /** The rules the customer is agreeing to, shown directly above the payment. */
    policy: { cancel: CancelPolicy; weatherPolicy: string };
}) {
    const t = useTranslations('golf.booking');
    const router = useRouter();
    const [repricing, startRepricing] = useTransition();
    const [leadName, setLeadName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [payment, setPayment] = useState<{ reference: string; clientSecret: string } | null>(null);

    const chosen = extras.filter(e => e.quantity > 0).map(e => ({ code: e.code, quantity: e.quantity }));

    const choose = (code: GolfExtraCode, quantity: number) => {
        const param = formatExtrasParam(extras.map(e => ({ code: e.code, quantity: e.code === code ? quantity : e.quantity })));
        startRepricing(() => {
            router.replace(
                `${bookPath}?teeTime=${teeTimeId}&players=${players}${param ? `&extras=${param}` : ''}${currency ? `&currency=${currency}` : ''}`,
                { scroll: false },
            );
        });
    };

    const start = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const response = await fetch('/api/golf/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-By': 'cheapestgo-client' },
                body: JSON.stringify({
                    teeTimeId, players, leadName, extras: chosen,
                    ...(currency ? { chargeCurrency: currency } : {}),
                    ...(displayedTotal != null ? { displayedTotal } : {}),
                }),
            });
            const json = await response.json().catch(() => ({}));
            if (response.ok) setPayment({ reference: json.data.reference, clientSecret: json.data.clientSecret });
            else if (json.code === 'not_enough_spots') setError(t('notEnoughSpots', { count: json.spotsLeft ?? 0 }));
            else if (json.code === 'tee_time_unavailable') setError(t('unavailable'));
            else if (json.code === 'price_changed') {
                // The server's new total is on the refreshed page; the card form is not shown yet.
                setError(t('priceChanged'));
                router.refresh();
            }
            else if (json.code === 'extras_unavailable') {
                setError(t('extrasUnavailable'));
                router.refresh();
            } else if (json.fieldErrors?.leadName) setError(t('leadNameRequired'));
            else if (response.status === 401) setError(t('loginRequired'));
            else setError(t('genericError'));
        } catch {
            setError(t('genericError'));
        } finally {
            setBusy(false);
        }
    };

    const statusPath = payment ? `/golf/bookings/${payment.reference}` : '';
    const row = 'flex justify-between gap-4';

    return (
        <div className="mx-auto grid max-w-5xl gap-12 px-4 pb-24 pt-10 lg:grid-cols-[minmax(0,1fr)_23rem]">
            <section className="flex min-w-0 flex-col gap-5">
                <h1 className="font-golf text-4xl font-extrabold leading-tight tracking-tight text-balance text-g-ink md:text-5xl">{t('checkoutTitle')}</h1>
                <p className="border-l-2 border-g-accent bg-g-sunk px-4 py-3 text-sm leading-relaxed text-g-ink">{t('chargeNotice')}</p>

                {extras.length > 0 && !payment && (
                    <section className="flex flex-col gap-4 border-y border-g-rule py-6" aria-busy={repricing}>
                        <div>
                            <h2 className="font-golf text-2xl font-bold tracking-tight text-g-ink">{t('extrasHeading')}</h2>
                            <p className="text-xs text-g-muted">{t('extrasHint')}</p>
                        </div>
                        {extras.map(extra => (
                            <div key={extra.code} className="flex items-center justify-between gap-3">
                                <div className="text-sm">
                                    <span className="block font-medium text-g-ink">{extra.name}</span>
                                    <span className="block text-xs tabular-nums text-g-muted">{extra.each}</span>
                                </div>
                                <GolfSelect ariaLabel={extra.name} compact align="right" disabled={repricing}
                                    value={String(extra.quantity)} onChange={quantity => choose(extra.code, Number(quantity))}
                                    options={Array.from({ length: players + 1 }, (_, n) => ({ value: String(n), label: String(n) }))} />
                            </div>
                        ))}
                    </section>
                )}

                <GolfPolicyBlock cancel={policy.cancel} weatherPolicy={policy.weatherPolicy} />

                {payment ? (
                    <StripeEmbeddedCheckout
                        clientSecret={payment.clientSecret}
                        onSuccess={() => router.push(statusPath)}
                        returnUrl={`${window.location.origin}${statusPath}`}
                    />
                ) : (
                    <form onSubmit={start} className="flex flex-col gap-2 border-t-2 border-g-ink pt-6">
                        <label htmlFor="lead-name" className="text-sm font-medium text-g-ink">{t('leadName')}</label>
                        <input id="lead-name" required maxLength={120} autoComplete="name" value={leadName}
                            onChange={e => setLeadName(e.target.value)}
                            className="rounded-sm border border-g-rule bg-g-surface px-3 py-2.5 text-g-ink transition-colors focus:border-g-accent" />
                        <p className="text-xs text-g-muted">{t('leadNameHint')}</p>
                        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                        <button type="submit" disabled={busy || repricing}
                            className="mt-3 flex items-center justify-center gap-2 rounded-sm bg-g-accent px-6 py-3 font-semibold text-g-accent-ink transition duration-200 hover:bg-g-accent-hover disabled:opacity-60 motion-safe:active:scale-[0.98]">
                            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} {t('continueToPayment')}
                        </button>
                    </form>
                )}
            </section>

            <aside className="h-fit border-t-4 border-g-accent bg-g-surface p-6 text-sm lg:sticky lg:top-24">
                <h2 className="font-golf mb-4 text-2xl font-bold tracking-tight text-g-ink">{t('summaryHeading')}</h2>
                <dl className="flex flex-col gap-2.5 text-g-muted">
                    <div className={row}><dt>{t('course')}</dt><dd className="text-right"><Link href={summary.courseHref} className="font-medium text-g-accent underline-offset-4 hover:underline">{summary.courseName}</Link></dd></div>
                    <div className={row}><dt>{t('dateLabel')}</dt><dd className="text-right">{summary.date}</dd></div>
                    <div className={row}><dt>{t('timeLabel')}</dt><dd className="text-right">{summary.time}</dd></div>
                    <div className={row}><dt>{t('playersLabel')}</dt><dd className="text-right">{players}</dd></div>
                </dl>
                <dl className={`mt-5 flex flex-col gap-2.5 border-t border-g-rule pt-5 tabular-nums text-g-muted ${repricing ? 'opacity-60' : ''}`}>
                    <div className={row}><dt>{summary.greenFeeLabel}</dt><dd>{summary.greenFee}</dd></div>
                    {summary.extraLines.map(line => (
                        <div key={line.label} className={row}><dt>{line.label}</dt><dd>{line.amount}</dd></div>
                    ))}
                    <div className={row}><dt>{t('serviceFee')}</dt><dd>{summary.serviceFee}</dd></div>
                    <div className={`${row} mt-1 items-baseline border-t border-g-ink pt-3 text-g-ink`}><dt className="font-bold">{t('total')}</dt><dd className="font-golf text-2xl font-medium">{summary.total}</dd></div>
                </dl>
            </aside>
        </div>
    );
}
