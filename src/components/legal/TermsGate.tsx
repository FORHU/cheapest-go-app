"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ScrollText, Check, ExternalLink } from 'lucide-react';

/**
 * Blocking first-visit Terms & Conditions gate.
 *
 * Acceptance is recorded per-browser in localStorage. Bumping TERMS_VERSION
 * re-prompts everyone, which is what you want when the terms materially change.
 *
 * The dialog is deliberately not dismissible — no close button, no click-outside,
 * no Escape. The only way past it is ticking the box and pressing Accept.
 */

export const TERMS_VERSION = '2025-05-01';
export const TERMS_STORAGE_KEY = 'cg-terms-accepted-version';

/** Read acceptance without throwing when storage is unavailable (private mode, SSR). */
export function hasAcceptedTerms(): boolean {
    try {
        return window.localStorage.getItem(TERMS_STORAGE_KEY) === TERMS_VERSION;
    } catch {
        return false;
    }
}

/**
 * The gate links out to these pages, and they live inside the same layout — so
 * they must never be gated, or the user can't read what they're being asked to
 * accept.
 */
const UNGATED_PATHS = [
    '/terms-of-service',
    '/privacy-policy',
    '/cookie-policy',
    '/refund-policy',
];

export function TermsGate() {
    const t = useTranslations('legal.termsGate');
    const pathname = usePathname();

    // `null` = not yet determined. localStorage is unavailable during SSR, so we
    // must not render the dialog on the server or the markup won't match on hydration.
    const [open, setOpen] = useState<boolean | null>(null);
    const [accepted, setAccepted] = useState(false);
    const acceptButtonRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);

    const isUngated = UNGATED_PATHS.some((p) => pathname?.startsWith(p));

    useEffect(() => {
        setOpen(!hasAcceptedTerms());
    }, []);

    const showGate = open === true && !isUngated;

    // Lock background scrolling while the gate is up.
    useEffect(() => {
        if (!showGate) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, [showGate]);

    // Keep focus inside the dialog. Escape is intentionally not handled: this
    // gate must not be dismissible.
    useEffect(() => {
        if (!showGate) return;

        const node = dialogRef.current;
        if (!node) return;

        const focusable = () =>
            Array.from(
                node.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )
            );

        focusable()[0]?.focus();

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            const items = focusable();
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [showGate]);

    const handleAccept = () => {
        if (!accepted) return;
        try {
            window.localStorage.setItem(TERMS_STORAGE_KEY, TERMS_VERSION);
        } catch {
            // Storage blocked (private mode). Let them through for this session
            // rather than trapping them behind a gate they can never clear.
        }
        setOpen(false);
    };

    if (!showGate) return null;

    const summaryPoints = t.raw('points') as string[];

    return (
        <div
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4"
            // No onClick handler: clicking the backdrop must not dismiss the gate.
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="terms-gate-title"
                aria-describedby="terms-gate-description"
                className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col max-h-[92vh] sm:max-h-[85vh]"
            >
                {/* Header — centered, with the two policy links sitting at the very top */}
                <div className="flex flex-col items-center text-center px-6 pt-6 pb-4">
                    <div className="size-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                        <ScrollText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>

                    <h2
                        id="terms-gate-title"
                        className="mt-3 text-lg font-bold text-slate-900 dark:text-white"
                    >
                        {t('title')}
                    </h2>
                    <p
                        id="terms-gate-description"
                        className="mt-1 text-sm text-slate-500 dark:text-slate-400"
                    >
                        {t('subtitle')}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                        <Link
                            href="/terms-of-service"
                            target="_blank"
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                        >
                            <ExternalLink className="h-3 w-3" />
                            {t('termsLink')}
                        </Link>
                        <Link
                            href="/privacy-policy"
                            target="_blank"
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                        >
                            <ExternalLink className="h-3 w-3" />
                            {t('privacyLink')}
                        </Link>
                    </div>

                    <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                        {t('opensInNewTab')}
                    </p>
                </div>

                {/* Scrollable summary */}
                <div className="flex-1 overflow-y-auto px-6 py-3 border-y border-slate-100 dark:border-white/5">
                    <ul className="space-y-3">
                        {summaryPoints.map((point, i) => (
                            <li key={i} className="flex gap-2.5 text-sm text-slate-600 dark:text-slate-300">
                                <Check className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
                                <span>{point}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Accept */}
                <div className="p-6 pt-4 space-y-4">
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={accepted}
                            onChange={(e) => setAccepted(e.target.checked)}
                            className="mt-0.5 size-4 shrink-0 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300">
                            {t('checkboxLabel')}
                        </span>
                    </label>

                    <button
                        ref={acceptButtonRef}
                        type="button"
                        onClick={handleAccept}
                        disabled={!accepted}
                        className="w-full py-3 px-4 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {t('acceptButton')}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default TermsGate;
