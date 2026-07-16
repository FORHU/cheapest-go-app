import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next/link', () => ({
    default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

vi.mock('next-intl', () => ({
    useTranslations: () => {
        const t: any = (k: string) => k;
        t.raw = (k: string) => (k === 'points' ? ['point one', 'point two'] : []);
        t.rich = (k: string) => k;
        return t;
    },
}));

import { TermsGate, TERMS_STORAGE_KEY, TERMS_VERSION } from '@/components/legal/TermsGate';

describe('TermsGate', () => {
    beforeEach(() => {
        window.localStorage.clear();
        document.body.style.overflow = '';
        pathname = '/';
    });

    it('blocks a first-time visitor until the box is ticked', () => {
        render(<TermsGate />);

        expect(screen.getByRole('dialog')).toBeInTheDocument();

        const acceptButton = screen.getByRole('button', { name: 'acceptButton' });
        expect(acceptButton).toBeDisabled();

        // Accepting without consenting must not record anything.
        fireEvent.click(acceptButton);
        expect(window.localStorage.getItem(TERMS_STORAGE_KEY)).toBeNull();

        fireEvent.click(screen.getByRole('checkbox'));
        expect(acceptButton).toBeEnabled();

        fireEvent.click(acceptButton);
        expect(window.localStorage.getItem(TERMS_STORAGE_KEY)).toBe(TERMS_VERSION);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('cannot be dismissed with Escape', () => {
        render(<TermsGate />);
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(window.localStorage.getItem(TERMS_STORAGE_KEY)).toBeNull();
    });

    it('does not show again once accepted', () => {
        window.localStorage.setItem(TERMS_STORAGE_KEY, TERMS_VERSION);
        render(<TermsGate />);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('re-prompts when the terms version changes', () => {
        window.localStorage.setItem(TERMS_STORAGE_KEY, 'some-older-version');
        render(<TermsGate />);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('never gates the legal pages it links to', () => {
        pathname = '/terms-of-service';
        render(<TermsGate />);

        expect(screen.queryByRole('dialog')).toBeNull();
        // Background scroll must not be locked on an ungated page.
        expect(document.body.style.overflow).not.toBe('hidden');
    });

    it('locks background scroll while open and restores it after accepting', () => {
        render(<TermsGate />);
        expect(document.body.style.overflow).toBe('hidden');

        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: 'acceptButton' }));

        expect(document.body.style.overflow).not.toBe('hidden');
    });
});
