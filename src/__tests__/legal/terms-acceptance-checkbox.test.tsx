import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('next-intl', async () => {
    // Import actual translations so content-based assertions work
    // (e.g., getByText(/acceptance of terms/i) matches the real translation value)
    const enJson = (await import('../../locales/en.json')).default;

    const dig = (obj: any, path: string): any =>
        path.split('.').reduce((acc: any, key: string) => acc?.[key], obj);

    return {
        useTranslations: (ns: string) => {
            const section = dig(enJson, ns);
            const t: any = (k: string): string => {
                const val = dig(section, k);
                return typeof val === 'string' ? val : k;
            };
            t.raw = (k: string): unknown => {
                const val = dig(section, k);
                return Array.isArray(val) ? val : [];
            };
            return t;
        },
        useLocale: () => 'en',
    };
});

import { TermsAcceptanceCheckbox } from '@/components/legal/TermsAcceptanceCheckbox';

/** Controlled wrapper so the checkbox reflects real toggle state. */
function Harness({ onChange }: { onChange?: (v: boolean) => void }) {
    const [checked, setChecked] = useState(false);
    return (
        <TermsAcceptanceCheckbox
            checked={checked}
            onChange={(v) => {
                setChecked(v);
                onChange?.(v);
            }}
        />
    );
}

describe('TermsAcceptanceCheckbox', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('toggles when the checkbox is clicked', () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);

        const box = screen.getByRole('checkbox');
        expect(box).not.toBeChecked();

        fireEvent.click(box);
        expect(onChange).toHaveBeenLastCalledWith(true);
        expect(box).toBeChecked();
    });

    it('opens the Terms modal without toggling the checkbox', () => {
        const onChange = vi.fn();
        render(<Harness onChange={onChange} />);

        expect(screen.queryByRole('dialog')).toBeNull();

        // Select by exact text: the trigger button's own text is "Terms & Conditions"
        // (the surrounding label has more text, so this resolves to the button).
        fireEvent.click(screen.getByText('Terms & Conditions'));

        const dialog = screen.getByRole('dialog');
        // Terms-specific heading proves the right doc rendered.
        expect(within(dialog).getByText(/acceptance of terms/i)).toBeInTheDocument();

        // Crucially, opening the modal must NOT have toggled the agreement.
        expect(onChange).not.toHaveBeenCalled();
        expect(screen.getByRole('checkbox')).not.toBeChecked();
    });

    it('opens the Privacy modal from the Privacy Policy link', () => {
        render(<Harness />);

        fireEvent.click(screen.getByText('Privacy Policy'));

        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText(/who we are/i)).toBeInTheDocument();
        // And it is the privacy doc, not terms.
        expect(within(dialog).queryByText(/acceptance of terms/i)).toBeNull();
    });

    it('renders an error message when provided', () => {
        render(
            <TermsAcceptanceCheckbox
                checked={false}
                onChange={() => {}}
                error="Please accept the terms."
            />
        );
        expect(screen.getByText('Please accept the terms.')).toBeInTheDocument();
        expect(screen.getByRole('checkbox')).toHaveAttribute('aria-invalid', 'true');
    });
});
