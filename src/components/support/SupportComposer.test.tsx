import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SupportComposer } from './SupportComposer';
import type { SupportAttachmentView } from './types';

const messages = {
    support: {
        composer: { placeholder: 'Type your message', connecting: 'Connecting…', send: 'Send' },
        attachments: {
            attach: 'Attach a file',
            uploading: 'Uploading…',
            remove: 'Remove {name}',
            download: 'Download {name}',
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

type ComposerProps = React.ComponentProps<typeof SupportComposer>;

/**
 * Defaults for the props that are not what a given test is about.
 *
 * `canAttach` is false by default so the older tests read as they did before attachments
 * existed: the paperclip is a thing a deployment may not have, and its absence must not
 * change how the box behaves.
 */
function renderComposer(over: Partial<ComposerProps> = {}) {
    const props: ComposerProps = {
        canSend: true,
        onSend: vi.fn(),
        attachments: [],
        canAttach: false,
        uploading: false,
        uploadError: null,
        onAttach: vi.fn(),
        onRemoveAttachment: vi.fn(),
        ...over,
    };
    render(<SupportComposer {...props} />, { wrapper: Wrapper });
    return props;
}

const attachment = (over: Partial<SupportAttachmentView> = {}): SupportAttachmentView => ({
    id: 'a1',
    fileName: 'confirmation.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024 * 400,
    uploadedByType: 'guest',
    ...over,
});

describe('SupportComposer', () => {
    it('sends what was typed and clears itself', async () => {
        const { onSend } = renderComposer();

        const box = screen.getByRole('textbox');
        fireEvent.change(box, { target: { value: 'Do you charge a change fee?' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));

        expect(onSend).toHaveBeenCalledWith('Do you charge a change fee?');
        expect(box).toHaveValue('');
    });

    it('sends on Enter, because that is what people do in a chat box', async () => {
        const { onSend } = renderComposer();

        const box = screen.getByRole('textbox');
        fireEvent.change(box, { target: { value: 'hello' } });
        fireEvent.submit(box.closest('form')!);

        expect(onSend).toHaveBeenCalledWith('hello');
    });

    it('refuses to send whitespace', async () => {
        const { onSend } = renderComposer();

        const box = screen.getByRole('textbox');
        fireEvent.change(box, { target: { value: '   ' } });
        fireEvent.submit(box.closest('form')!);

        expect(onSend).not.toHaveBeenCalled();
    });

    it('says it is connecting rather than silently swallowing a message', async () => {
        // A composer that looks usable but drops what is typed is worse than one that
        // says it is not ready.
        const { onSend } = renderComposer({ canSend: false });

        const box = screen.getByRole('textbox');
        expect(box).toBeDisabled();
        expect(box).toHaveAttribute('placeholder', 'Connecting…');

        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        expect(onSend).not.toHaveBeenCalled();
    });

    it('sends a file with no words, because the file is often the whole message', () => {
        const { onSend } = renderComposer({
            canAttach: true,
            attachments: [attachment()],
        });

        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        expect(onSend).toHaveBeenCalledWith('');
    });

    it('hides the paperclip where the deployment has no bucket', () => {
        renderComposer({ canAttach: false });
        expect(screen.queryByRole('button', { name: 'Attach a file' })).toBeNull();
    });

    it('hands the picked file straight up, before any message exists', () => {
        const { onAttach } = renderComposer({ canAttach: true });

        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        const file = new File(['x'], 'passport.jpg', { type: 'image/jpeg' });
        fireEvent.change(input, { target: { files: [file] } });

        expect(onAttach).toHaveBeenCalledWith(file);
    });

    it('lists what is attached, with its size, so the customer can check it is the right file', () => {
        renderComposer({ canAttach: true, attachments: [attachment()] });

        expect(screen.getByText('confirmation.pdf')).toBeInTheDocument();
        expect(screen.getByText('400 KB')).toBeInTheDocument();
    });

    it('lets an attachment be taken back before it is sent', () => {
        const { onRemoveAttachment } = renderComposer({
            canAttach: true,
            attachments: [attachment({ id: 'a9' })],
        });

        fireEvent.click(screen.getByRole('button', { name: 'Remove confirmation.pdf' }));
        expect(onRemoveAttachment).toHaveBeenCalledWith('a9');
    });

    it('shows the server’s reason for refusing a file, rather than a generic failure', () => {
        // The server is the only side that knows whether it was the size, the type, or one
        // file too many, so its words are what the customer reads.
        renderComposer({ canAttach: true, uploadError: 'Files must be 10 MB or smaller.' });

        expect(screen.getByRole('alert')).toHaveTextContent('Files must be 10 MB or smaller.');
    });

    it('will not take a second file while one is still uploading', () => {
        renderComposer({ canAttach: true, uploading: true });
        expect(screen.getByRole('button', { name: 'Uploading…' })).toBeDisabled();
    });
});
