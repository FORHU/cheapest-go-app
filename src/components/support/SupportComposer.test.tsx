import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SupportComposer } from './SupportComposer';

const messages = {
    support: {
        composer: { placeholder: 'Type your message', connecting: 'Connecting…', send: 'Send' },
    },
};

function Wrapper({ children }: { children: React.ReactNode }) {
    return (
        <NextIntlClientProvider locale="en" messages={messages}>
            {children}
        </NextIntlClientProvider>
    );
}

describe('SupportComposer', () => {
    it('sends what was typed and clears itself', async () => {
        const onSend = vi.fn();
        render(<SupportComposer canSend onSend={onSend} />, { wrapper: Wrapper });

        const box = screen.getByRole('textbox');
        fireEvent.change(box, { target: { value: 'Do you charge a change fee?' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));

        expect(onSend).toHaveBeenCalledWith('Do you charge a change fee?');
        expect(box).toHaveValue('');
    });

    it('sends on Enter, because that is what people do in a chat box', async () => {
        const onSend = vi.fn();
        render(<SupportComposer canSend onSend={onSend} />, { wrapper: Wrapper });

        const box = screen.getByRole('textbox');
        fireEvent.change(box, { target: { value: 'hello' } });
        fireEvent.submit(box.closest('form')!);

        expect(onSend).toHaveBeenCalledWith('hello');
    });

    it('refuses to send whitespace', async () => {
        const onSend = vi.fn();
        render(<SupportComposer canSend onSend={onSend} />, { wrapper: Wrapper });

        const box = screen.getByRole('textbox');
        fireEvent.change(box, { target: { value: '   ' } });
        fireEvent.submit(box.closest('form')!);

        expect(onSend).not.toHaveBeenCalled();
    });

    it('says it is connecting rather than silently swallowing a message', async () => {
        // A composer that looks usable but drops what is typed is worse than one that
        // says it is not ready.
        const onSend = vi.fn();
        render(<SupportComposer canSend={false} onSend={onSend} />, { wrapper: Wrapper });

        const box = screen.getByRole('textbox');
        expect(box).toBeDisabled();
        expect(box).toHaveAttribute('placeholder', 'Connecting…');

        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        expect(onSend).not.toHaveBeenCalled();
    });
});
