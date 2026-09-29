import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/locales/en.json';
import { PassengerDetailsCard } from '@/components/flights/booking/PassengerDetailsCard';
import type { FlightPassengerForm } from '@/lib/schemas/flight';

/**
 * The flight book page's passenger card, drawn as the design draws it (Figma
 * "Version 1", the flight book frame): a blue person glyph beside "First
 * Passenger", a "Fields marked with * are required" line, and every field
 * labelled above its input with a red asterisk.
 */

const blank: FlightPassengerForm = {
    type: 'ADT', firstName: '', lastName: '', gender: 'M', birthDate: '',
    nationality: 'KR', passport: '', passportExpiry: '',
};

function renderCard(props: Partial<React.ComponentProps<typeof PassengerDetailsCard>> = {}) {
    const handlers = { onChange: vi.fn(), onValidate: vi.fn(), onRemove: vi.fn() };
    render(
        <NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">
            <PassengerDetailsCard
                index={0}
                passenger={blank}
                errors={{}}
                canRemove={false}
                {...handlers}
                {...props}
            />
        </NextIntlClientProvider>,
    );
    return handlers;
}

describe('PassengerDetailsCard', () => {
    it('titles the card by the passenger ordinal', () => {
        renderCard({ index: 0 });
        expect(screen.getByRole('heading', { name: 'First Passenger' })).toBeInTheDocument();
    });

    it('titles the second passenger "Second Passenger"', () => {
        renderCard({ index: 1 });
        expect(screen.getByRole('heading', { name: 'Second Passenger' })).toBeInTheDocument();
    });

    it('falls back to a number past the spelled-out ordinals', () => {
        renderCard({ index: 10 });
        expect(screen.getByRole('heading', { name: 'Passenger 11' })).toBeInTheDocument();
    });

    it('says which fields are required under the title', () => {
        renderCard();
        expect(screen.getByText(/Fields marked with/)).toHaveTextContent('Fields marked with * are required');
    });

    it('labels each text field above its input, with the asterisk drawn in red', () => {
        renderCard();
        const first = screen.getByLabelText(/^Firstname/);
        expect(first).toBeRequired();
        const label = document.querySelector(`label[for="${first.id}"]`) as HTMLElement;
        expect(within(label).getByText('*')).toHaveClass('text-red-500');
        expect(screen.getByLabelText(/^Lastname/)).toBeRequired();
        expect(screen.getByLabelText(/^Passport Number/)).toBeRequired();
    });

    it('shows the design placeholders in the text fields', () => {
        renderCard();
        expect(screen.getByLabelText(/^Firstname/)).toHaveAttribute('placeholder', 'John');
        expect(screen.getByLabelText(/^Lastname/)).toHaveAttribute('placeholder', 'Doe');
        expect(screen.getByLabelText(/^Passport Number/)).toHaveAttribute('placeholder', 'P12345678');
    });

    it('lays the fields out in the design order, birthdate last', () => {
        renderCard();
        const labels = Array.from(document.querySelectorAll('section label')).map(l => l.textContent?.replace(/\s*\*$/, ''));
        expect(labels).toEqual(['Firstname', 'Lastname', 'Sex', 'Country', 'Passport Number', 'Passport Expiry Date', 'Birthdate']);
    });

    it('stretches the dropdown and date fields across their column', () => {
        renderCard();
        const sex = screen.getByRole('button', { name: /^Sex/ });
        expect(sex).toHaveClass('w-full');
        expect(sex.parentElement).toHaveClass('w-full');
        expect(sex.parentElement).not.toHaveClass('inline-block');
    });

    it('outlines fields in grey until focused, then blue', () => {
        renderCard();
        const first = screen.getByLabelText(/^Firstname/);
        expect(first).toHaveClass('border-[#d9d9d9]');
        expect(first).toHaveClass('focus:border-blue-600');
    });

    it('reports an edit by field name and validates the field on blur', () => {
        const { onChange, onValidate } = renderCard();
        const first = screen.getByLabelText(/^Firstname/);
        fireEvent.change(first, { target: { value: 'Ana' } });
        expect(onChange).toHaveBeenCalledWith('firstName', 'Ana');
        fireEvent.blur(first, { target: { value: 'Ana' } });
        expect(onValidate).toHaveBeenCalledWith('passengers.0.firstName', 'Ana');
    });

    it('shows a field error beneath its field and marks the input invalid', () => {
        renderCard({ errors: { 'passengers.0.lastName': 'Enter a last name' } });
        expect(screen.getByRole('alert')).toHaveTextContent('Enter a last name');
        expect(screen.getByLabelText(/^Lastname/)).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByLabelText(/^Firstname/)).toHaveAttribute('aria-invalid', 'false');
    });

    it('offers Remove only when there is more than one passenger', () => {
        renderCard({ canRemove: false });
        expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    });

    it('removes the passenger from its Remove button', () => {
        const { onRemove } = renderCard({ canRemove: true });
        fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
        expect(onRemove).toHaveBeenCalledOnce();
    });
});
