import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { EscalationForm } from './EscalationForm';

/**
 * The one moment a guest is asked who they are.
 *
 * It exists because an escalated conversation must be answerable — the database refuses a
 * queued row with no way to reach anyone (ADR-0029 explains why the address is a reply-to
 * and never a credential). So the form's job is to collect something usable, and to stay
 * out of the way of everyone who does not need it.
 */

const messages = {
    support: {
        escalate: {
            title: 'Talk to a person',
            intro: 'Leave your name and email so someone from the team can reply.',
            name: 'Name',
            email: 'Email',
            submit: 'Request a person',
            cancel: 'Not now',
        },
    },
};

function Wrapper({ children }: { children: React.ReactNode }) {
    return (
        <NextIntlClientProvider locale="en" messages={messages}>
            {children}
        </NextIntlClientProvider>
    );
}

function fill(name: string, email: string) {
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
}

describe('EscalationForm', () => {
    it('passes on a name and email', () => {
        const onSubmit = vi.fn();
        render(<EscalationForm submitting={false} onSubmit={onSubmit} onCancel={() => {}} />, {
            wrapper: Wrapper,
        });

        fill('Ana Reyes', 'ana@example.com');
        fireEvent.click(screen.getByRole('button', { name: 'Request a person' }));

        expect(onSubmit).toHaveBeenCalledWith({ name: 'Ana Reyes', email: 'ana@example.com' });
    });

    it('will not submit without a name', () => {
        const onSubmit = vi.fn();
        render(<EscalationForm submitting={false} onSubmit={onSubmit} onCancel={() => {}} />, {
            wrapper: Wrapper,
        });

        fill('  ', 'ana@example.com');
        fireEvent.click(screen.getByRole('button', { name: 'Request a person' }));

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('will not submit something that is not an email', () => {
        // The server checks this too. Catching it here saves a round trip that would come
        // back as a rejection at the moment someone is already asking for help.
        const onSubmit = vi.fn();
        render(<EscalationForm submitting={false} onSubmit={onSubmit} onCancel={() => {}} />, {
            wrapper: Wrapper,
        });

        fill('Ana Reyes', 'ana@example');
        fireEvent.click(screen.getByRole('button', { name: 'Request a person' }));

        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('cannot be submitted twice while the first is in flight', () => {
        const onSubmit = vi.fn();
        render(<EscalationForm submitting onSubmit={onSubmit} onCancel={() => {}} />, {
            wrapper: Wrapper,
        });

        expect(screen.getByRole('button', { name: 'Request a person' })).toBeDisabled();
    });

    it('can be dismissed by someone who changed their mind', () => {
        const onCancel = vi.fn();
        render(<EscalationForm submitting={false} onSubmit={() => {}} onCancel={onCancel} />, {
            wrapper: Wrapper,
        });

        fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

        expect(onCancel).toHaveBeenCalledOnce();
    });
});
