/**
 * The legal modal cannot be closed until the reader scrolls to the very bottom.
 * Every close path (footer button, X, Escape, backdrop) is gated on that.
 */
import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next-intl', () => ({
    useTranslations: () => {
        const t: any = (k: string) => k;
        t.raw = () => [];
        return t;
    },
    useLocale: () => 'en',
}));

import { LegalModal } from '@/components/legal/LegalModal';

function Harness() {
    const [open, setOpen] = useState(true);
    return (
        <div>
            <span data-testid="state">{open ? 'open' : 'closed'}</span>
            <LegalModal open={open} doc="terms" onOpenChange={setOpen} />
        </div>
    );
}

/** happy-dom doesn't lay out, so drive scroll metrics manually. */
function setScroll(el: Element, { scrollTop, scrollHeight, clientHeight }: {
    scrollTop: number; scrollHeight: number; clientHeight: number;
}) {
    Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true });
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
}

describe('LegalModal scroll-to-bottom gate', () => {
    it('locks Close until the body is scrolled to the bottom', () => {
        render(<Harness />);

        const closeBtn = screen.getByTestId('legal-modal-close');
        expect(closeBtn).toBeDisabled();
        expect(screen.getByText(/scroll to the bottom to continue/i)).toBeInTheDocument();

        const scroller = screen.getByTestId('legal-modal-scroll');

        // Partway down — still locked.
        setScroll(scroller, { scrollTop: 100, scrollHeight: 1000, clientHeight: 400 });
        fireEvent.scroll(scroller);
        expect(closeBtn).toBeDisabled();

        // At the very bottom — unlocked.
        setScroll(scroller, { scrollTop: 600, scrollHeight: 1000, clientHeight: 400 });
        fireEvent.scroll(scroller);
        expect(closeBtn).toBeEnabled();
    });

    it('actually closes once unlocked', () => {
        render(<Harness />);
        const scroller = screen.getByTestId('legal-modal-scroll');

        setScroll(scroller, { scrollTop: 600, scrollHeight: 1000, clientHeight: 400 });
        fireEvent.scroll(scroller);

        fireEvent.click(screen.getByTestId('legal-modal-close'));
        expect(screen.getByTestId('state')).toHaveTextContent('closed');
    });

    it('ignores close attempts (Escape) before reaching the bottom', () => {
        render(<Harness />);
        expect(screen.getByTestId('state')).toHaveTextContent('open');

        fireEvent.keyDown(window, { key: 'Escape' });

        // Still open — the gate blocked it.
        expect(screen.getByTestId('state')).toHaveTextContent('open');
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
});
