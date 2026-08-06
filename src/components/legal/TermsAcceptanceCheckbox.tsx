"use client";

import React, { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LegalModal, type LegalDoc } from './LegalModal';

interface TermsAcceptanceCheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    error?: string;
    disabled?: boolean;
}

/**
 * "I agree to the Terms & Conditions and Privacy Policy" checkbox.
 *
 * The two policy names are buttons that open a scrollable LegalModal in place,
 * rather than links that navigate away. They are interactive descendants of the
 * <label>, so clicking them does not toggle the checkbox, and type="button"
 * keeps them from submitting the surrounding form.
 */
export function TermsAcceptanceCheckbox({
    checked,
    onChange,
    error,
    disabled,
}: TermsAcceptanceCheckboxProps) {
    const t = useTranslations('legal.termsGate');
    const checkboxId = useId();
    const errorId = useId();

    const [modalOpen, setModalOpen] = useState(false);
    // Kept separate from `modalOpen` so the title doesn't flip during the
    // close animation.
    const [doc, setDoc] = useState<LegalDoc>('terms');

    const openDoc = (which: LegalDoc) => {
        setDoc(which);
        setModalOpen(true);
    };

    const linkClass =
        'font-medium text-blue-600 dark:text-blue-400 hover:underline underline-offset-2 disabled:no-underline';

    // The sentence is a plain <span>, not a <label>, on purpose: nesting the
    // policy <button>s inside a label lets a label→checkbox click forward toggle
    // the box when the user only meant to open a policy. The checkbox instead
    // carries its own aria-label, so screen readers still announce it fully.
    return (
        <div>
            <div className="flex items-start gap-2.5">
                <input
                    id={checkboxId}
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    disabled={disabled}
                    aria-invalid={!!error}
                    aria-label={t('checkboxAriaLabel')}
                    aria-describedby={error ? errorId : undefined}
                    className="mt-0.5 size-4 shrink-0 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                />
                <span className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t('checkboxPrefix')}
                    <button
                        type="button"
                        onClick={() => openDoc('terms')}
                        disabled={disabled}
                        className={linkClass}
                    >
                        {t('checkboxTerms')}
                    </button>
                    {t('checkboxConnector')}
                    <button
                        type="button"
                        onClick={() => openDoc('privacy')}
                        disabled={disabled}
                        className={linkClass}
                    >
                        {t('checkboxPrivacy')}
                    </button>
                    {t('checkboxSuffix')}
                </span>
            </div>

            {error && (
                <p id={errorId} className="mt-1.5 ml-6 text-xs font-medium text-rose-500">
                    {error}
                </p>
            )}

            <LegalModal open={modalOpen} doc={doc} onOpenChange={setModalOpen} />
        </div>
    );
}

export default TermsAcceptanceCheckbox;
