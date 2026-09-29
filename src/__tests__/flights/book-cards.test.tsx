import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Luggage } from 'lucide-react';
import en from '@/locales/en.json';
import { BillingAddressCard, ContactInformationCard } from '@/components/flights/booking/ContactCards';
import { BookCollapsibleCard } from '@/components/flights/booking/BookCard';
import type { FlightContactForm } from '@/lib/schemas/flight';

/**
 * The flight book page's other cards follow the passenger card's design: an
 * outlined card with a 16px title, the required-fields line, and labelled
 * pill fields outlined in grey that turn blue on focus.
 */

const contact: FlightContactForm = { email: '', phone: '', countryCode: '82', addressLine: '', city: '', postalCode: '', country: '' };

function withIntl(ui: React.ReactElement) {
    return render(<NextIntlClientProvider locale="en" messages={en as never} timeZone="UTC">{ui}</NextIntlClientProvider>);
}

describe('ContactInformationCard', () => {
    it('sits on the search page card surface: titled card, required note, labelled pill fields', () => {
        withIntl(<ContactInformationCard contact={contact} errors={{}} onChange={() => {}} onValidate={() => {}} />);
        expect(screen.getByRole('heading', { name: 'Contact Information' }).closest('section')).toHaveClass('rounded-2xl', 'border-slate-200/70');
        expect(screen.getByText(/Fields marked with/)).toBeInTheDocument();
        const email = screen.getByLabelText(/^Email Address/);
        expect(email).toBeRequired();
        expect(email).toHaveClass('rounded-xl', 'border-[#d9d9d9]', 'focus:border-blue-600');
        expect(screen.getByLabelText(/^Phone Number/)).toHaveClass('rounded-xl');
    });

    it('reports edits by field and validates on blur', () => {
        const onChange = vi.fn();
        const onValidate = vi.fn();
        withIntl(<ContactInformationCard contact={contact} errors={{}} onChange={onChange} onValidate={onValidate} />);
        const email = screen.getByLabelText(/^Email Address/);
        fireEvent.change(email, { target: { value: 'a@b.co' } });
        expect(onChange).toHaveBeenCalledWith('email', 'a@b.co');
        fireEvent.blur(email, { target: { value: 'a@b.co' } });
        expect(onValidate).toHaveBeenCalledWith('contact.email', 'a@b.co');
    });

    it('shows a field error beneath its field', () => {
        withIntl(<ContactInformationCard contact={contact} errors={{ 'contact.phone': 'Phone number is required' }} onChange={() => {}} onValidate={() => {}} />);
        expect(screen.getByRole('alert')).toHaveTextContent('Phone number is required');
        expect(screen.getByLabelText(/^Phone Number/)).toHaveAttribute('aria-invalid', 'true');
    });
});

describe('BillingAddressCard', () => {
    it('labels each address field above its pill', () => {
        withIntl(<BillingAddressCard contact={contact} errors={{}} onChange={() => {}} />);
        expect(screen.getByRole('heading', { name: 'Billing Address' })).toBeInTheDocument();
        for (const label of [/^Address Line/, /^City/, /^Postal Code/]) {
            expect(screen.getByLabelText(label)).toHaveClass('rounded-xl');
        }
        expect(screen.getByRole('button', { name: /^Country/ })).toHaveClass('w-full');
    });
});

describe('BookCollapsibleCard', () => {
    it('opens from its header and keeps a mounted body hidden while closed', () => {
        const onToggle = vi.fn();
        const { rerender } = render(
            <BookCollapsibleCard icon={Luggage} title="Extra Bags" subtitle="Optional" open={false} onToggle={onToggle} keepMounted>
                <p>panel</p>
            </BookCollapsibleCard>,
        );
        const header = screen.getByRole('button', { name: /Extra Bags/ });
        expect(header).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByText('panel')).not.toBeVisible();
        fireEvent.click(header);
        expect(onToggle).toHaveBeenCalledOnce();

        rerender(
            <BookCollapsibleCard icon={Luggage} title="Extra Bags" open onToggle={onToggle} keepMounted>
                <p>panel</p>
            </BookCollapsibleCard>,
        );
        expect(screen.getByText('panel')).toBeVisible();
    });
});
