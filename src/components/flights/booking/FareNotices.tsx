"use client";

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { FarePolicy } from '@/types/flights';

/*
 * The fare's policy and the offer's countdown on the flight book page, as the design
 * draws them — flat on the page rather than boxed:
 *
 *   ⏱ Offer expires in 8:44 - complete your booking before the time runs out        (red)
 *
 *   ⚠ Fare Policy Updated  (Refundable (fees may apply)) (Changes allowed)
 *     The refundability of this fare has changed since you selected it. Please review…
 *     Indicative only — final policy confirmed at payment stage.                      (grey)
 */

// ─── Offer expiry countdown ──────────────────────────────────────────

/** Whole seconds left until `expiresAt`, ticking once a second; null until the first tick. */
function useCountdown(expiresAt: Date | null) {
    const [secsLeft, setSecsLeft] = useState<number | null>(null);
    useEffect(() => {
        if (!expiresAt) return;
        const tick = () => setSecsLeft(Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [expiresAt]);
    return secsLeft;
}

/**
 * The design's countdown glyph: a clock with three speed lines trailing to its left.
 * Lucide has no such icon, so it is drawn here on Lucide's 24-unit grid and stroke.
 */
function FastClock({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
            <circle cx="14.5" cy="12" r="8" />
            <path d="M14.5 8v4l2.5 1.5" />
            <path d="M2 8h3.5M1 12h3.5M2 16h3.5" />
        </svg>
    );
}

/** The time left on a Duffel offer — shown for its last ten minutes, in red, as one line. */
export function OfferExpiryBanner({ expiresAt }: { expiresAt: Date }) {
    const t = useTranslations('flightBook');
    const secsLeft = useCountdown(expiresAt);
    if (secsLeft === null || secsLeft > 10 * 60) return null;
    const mins = Math.floor(secsLeft / 60);
    const secs = secsLeft % 60;
    return (
        <div role="timer" aria-live="off" className="flex items-center gap-2 text-[12px] lg:text-[13px] text-red-600 dark:text-red-400 mb-3 lg:mb-6">
            <FastClock className="w-5 h-5 shrink-0" />
            <span>
                {secsLeft === 0
                    ? t('offerExpiry.expired')
                    : t('offerExpiry.expiresIn', { time: `${mins}:${String(secs).padStart(2, '0')}` })}
            </span>
        </div>
    );
}

// ─── Fare policy ─────────────────────────────────────────────────────

/**
 * The updated-policy notice split into its title and its explanation.
 *
 * Every locale writes it as one string — "<strong>Fare Policy Updated.</strong> The
 * refundability…" — and the design sets the two parts apart: the bold lead becomes the
 * heading, the rest the line under it. Splitting here keeps each translation whole
 * instead of asking every locale for two new keys. The lead's closing stop, Latin or
 * full-width, is dropped, since a heading does not end in one.
 */
export function splitPolicyNotice(raw: string): { title: string; body: string } {
    const m = /^\s*<strong>([\s\S]*?)<\/strong>\s*([\s\S]*)$/.exec(raw);
    if (!m) return { title: '', body: raw.trim() };
    return { title: m[1].trim().replace(/[.。．]+$/, ''), body: m[2].trim() };
}

const BADGE = 'inline-flex items-center h-[22px] px-4 rounded-full bg-[#e5e5e5] dark:bg-slate-800 text-[12px] text-[#1c1b1f] dark:text-slate-200 whitespace-nowrap';

/** The fare's refundability and changeability, as searched or as the airline re-confirmed them. */
export function FarePolicyPanel({ policy, policyChanged = false }: { policy: FarePolicy; policyChanged?: boolean }) {
    const t = useTranslations('flightBook');
    const isLocked = policy.policyVersion === 'revalidated';
    const penalty = policy.refundPenaltyAmount;

    const refundLabel = !policy.isRefundable
        ? t('farePolicy.nonRefundable')
        : penalty === 0
            ? t('farePolicy.freeCancellation')
            : penalty != null && penalty > 0
                ? t('farePolicy.refundableFee', { fee: `${policy.refundPenaltyCurrency ?? ''}${penalty}` })
                : t('farePolicy.refundableFeesMayApply');

    const notice = policyChanged ? splitPolicyNotice(t.raw('farePolicy.policyUpdated') as string) : null;
    const title = notice?.title || t('farePolicy.title');

    return (
        <div className="mb-3 lg:mb-6">
            {/* Glyph, title and badges share one row, wrapping on a narrow column */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {notice
                    ? <AlertTriangle data-icon="warning" className="w-6 h-6 shrink-0 text-red-600 dark:text-red-400" strokeWidth={1.75} aria-hidden />
                    : <RefreshCw className="w-6 h-6 shrink-0 text-blue-600 dark:text-blue-400" strokeWidth={1.75} aria-hidden />}
                <h3 className="-ml-2 text-[16px] font-normal text-[#1c1b1f] dark:text-white">{title}</h3>
                <span className={BADGE}>{refundLabel}</span>
                {policy.isChangeable && <span className={BADGE}>{t('farePolicy.changesAllowed')}</span>}
                {isLocked && (
                    <span className="text-[11px] lg:text-[12px] text-emerald-600 dark:text-emerald-400">{t('farePolicy.airlineConfirmed')}</span>
                )}
            </div>

            {/* Under the title, not under the glyph */}
            <div className="mt-2 pl-8">
                {notice?.body && (
                    <p className="text-[14px] leading-snug text-[#1c1b1f] dark:text-slate-200">{notice.body}</p>
                )}
                <p className="text-[13px] leading-snug text-[#939fb1] dark:text-slate-400">
                    {isLocked ? t('farePolicy.finalRules') : t('farePolicy.indicativeOnly')}
                </p>
            </div>
        </div>
    );
}
