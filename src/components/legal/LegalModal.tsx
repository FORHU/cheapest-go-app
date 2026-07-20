"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import {
    getTermsSections,
    getPrivacySections,
    LEGAL_EFFECTIVE_DATE,
    LEGAL_LAST_UPDATED,
} from './content/legalSections';

export type LegalDoc = 'terms' | 'privacy';

interface LegalModalProps {
    open: boolean;
    doc: LegalDoc;
    onOpenChange: (open: boolean) => void;
}

// How close to the bottom (px) counts as "read to the end". A few pixels of
// slack absorbs sub-pixel rounding so the gate reliably opens.
const BOTTOM_THRESHOLD = 16;

/**
 * On-demand, scrollable legal document viewer. Renders the same content as the
 * standalone /terms-of-service and /privacy-policy pages (shared source in
 * ./content/legalSections) without navigating away.
 *
 * The user must scroll to the very bottom before the document can be closed:
 * every close path (footer button, the X, Escape, backdrop click) funnels
 * through onOpenChange, which is gated on `reachedBottom` here.
 */
export function LegalModal({ open, doc, onOpenChange }: LegalModalProps) {
    const t = useTranslations('legal');
    const sections = doc === 'terms' ? getTermsSections(t) : getPrivacySections(t);
    const title = doc === 'terms' ? t('termsOfService.pageTitle') : t('privacyPolicy.pageTitle');

    const bodyRef = useRef<HTMLDivElement>(null);
    const [reachedBottom, setReachedBottom] = useState(false);

    const measure = useCallback(() => {
        const el = bodyRef.current;
        if (!el) return;
        // If the content is short enough that there's nothing to scroll, treat it
        // as already read. Guard on clientHeight > 0 so an unmeasured element
        // (before layout) doesn't falsely satisfy the gate.
        if (el.clientHeight > 0 && el.scrollHeight - el.clientHeight <= BOTTOM_THRESHOLD) {
            setReachedBottom(true);
        }
    }, []);

    // Reset the gate each time the modal opens or the document switches, then
    // check whether the content even needs scrolling. Double rAF waits for
    // layout to settle after the open animation begins.
    useEffect(() => {
        if (!open) return;
        setReachedBottom(false);
        let r2 = 0;
        const r1 = requestAnimationFrame(() => {
            r2 = requestAnimationFrame(measure);
        });
        return () => {
            cancelAnimationFrame(r1);
            cancelAnimationFrame(r2);
        };
    }, [open, doc, measure]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        if (el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD) {
            setReachedBottom(true);
        }
    };

    // Gate every close attempt. Opening always passes through.
    const requestOpenChange = (next: boolean) => {
        if (!next && !reachedBottom) return;
        onOpenChange(next);
    };

    return (
        <Dialog open={open} onOpenChange={requestOpenChange}>
            <DialogContent
                role="dialog"
                aria-modal="true"
                aria-label={title}
                showCloseButton={reachedBottom}
                className="max-w-2xl p-0 flex flex-col max-h-[85vh]"
            >
                {/* Header — stays put while the body scrolls */}
                <div className="shrink-0 px-6 pt-6 pb-4 border-b border-slate-200 dark:border-white/10">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white pr-8">
                        {title}
                    </h2>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400 dark:text-slate-500">
                        <span>Effective: {LEGAL_EFFECTIVE_DATE}</span>
                        <span>Last updated: {LEGAL_LAST_UPDATED}</span>
                    </div>
                </div>

                {/* Scrollable body */}
                <div
                    ref={bodyRef}
                    data-testid="legal-modal-scroll"
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto px-6 py-5 space-y-6"
                >
                    {sections.map((section, i) => (
                        <section key={i}>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] font-bold shrink-0">
                                    {i + 1}
                                </span>
                                {section.title}
                            </h3>
                            <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-2 pl-8 [&_a]:text-blue-600 [&_a]:dark:text-blue-400 [&_a]:hover:underline">
                                {section.content}
                            </div>
                        </section>
                    ))}
                </div>

                {/* Footer — Close is locked until the reader reaches the end */}
                <div className="shrink-0 px-6 py-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-between gap-3">
                    <p
                        className={`flex items-center gap-1.5 text-xs ${
                            reachedBottom
                                ? 'text-transparent select-none'
                                : 'text-slate-500 dark:text-slate-400'
                        }`}
                        aria-hidden={reachedBottom}
                    >
                        <ArrowDown className="h-3.5 w-3.5" />
                        Scroll to the bottom to continue
                    </p>
                    <button
                        type="button"
                        data-testid="legal-modal-close"
                        onClick={() => onOpenChange(false)}
                        disabled={!reachedBottom}
                        className="shrink-0 px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Close
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default LegalModal;
