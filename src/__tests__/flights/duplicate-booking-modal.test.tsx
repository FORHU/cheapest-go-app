import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/locales/en.json';
import koMessages from '@/locales/ko.json';
import { DuplicateBookingModal } from '@/components/flights/DuplicateBookingModal';

const DATA = {
    existingBookingId: 'bk_123',
    route: 'GMP → CJU',
    departureDate: '2026-08-26',
};

function renderModal(
    props: Partial<React.ComponentProps<typeof DuplicateBookingModal>> = {},
    messages: any = enMessages,
    locale = 'en',
) {
    const onKeep = vi.fn();
    const onView = vi.fn();
    render(
        <NextIntlClientProvider locale={locale} messages={messages}>
            <DuplicateBookingModal data={DATA} onKeep={onKeep} onView={onView} {...props} />
        </NextIntlClientProvider>,
    );
    return { onKeep, onView };
}

describe('DuplicateBookingModal', () => {
    it('renders nothing until the server reports a duplicate', () => {
        renderModal({ data: null });
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('shows the title and both actions when a duplicate is reported', () => {
        renderModal();
        expect(screen.getByText('You already have a flight booked on this day')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Keep existing booking' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'View existing booking' })).toBeTruthy();
    });

    it('interpolates the clashing route and date into the description', () => {
        // Guards the <mono> rich-text tags added to the locale strings: if the tag
        // handler is missing or misnamed, next-intl throws instead of rendering.
        renderModal();
        expect(screen.getByText('GMP → CJU')).toBeTruthy();
        expect(screen.getByText('2026-08-26')).toBeTruthy();
    });

    it('renders route and date monospaced, per the design', () => {
        renderModal();
        expect(screen.getByText('GMP → CJU').className).toContain('font-mono');
        expect(screen.getByText('2026-08-26').className).toContain('font-mono');
    });

    it('has no close affordance — dismissing without choosing is not an option', () => {
        // The form behind cannot be submitted either way, so an X would strand
        // the traveller on a page that will refuse them again.
        renderModal();
        expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
    });

    it('calls onKeep when the traveller keeps the existing booking', () => {
        const { onKeep, onView } = renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'Keep existing booking' }));
        expect(onKeep).toHaveBeenCalledTimes(1);
        expect(onView).not.toHaveBeenCalled();
    });

    it('passes the clashing booking id when viewing it', () => {
        const { onView } = renderModal();
        fireEvent.click(screen.getByRole('button', { name: 'View existing booking' }));
        expect(onView).toHaveBeenCalledWith('bk_123');
    });

    it('renders the Korean locale without throwing on the rich-text tags', () => {
        // Every locale got the same <mono> wrappers; a mismatch in one of them
        // would only surface for users of that language.
        renderModal({}, koMessages, 'ko');
        expect(screen.getByText('GMP → CJU')).toBeTruthy();
        expect(screen.getByText('2026-08-26')).toBeTruthy();
    });
});
