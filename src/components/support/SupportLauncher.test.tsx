import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SupportLauncher } from './SupportLauncher';

/**
 * The floating button.
 *
 * Two things matter beyond it being clickable: it must be reachable and describable
 * without sight, and it must sit *below* the app's modals. A support bubble floating over
 * a photo gallery or a map is a bug, and the z-index that causes it is invisible until
 * someone opens one.
 */

const messages = {
    support: {
        launcherOpen: 'Get help',
        launcherClose: 'Close support',
    },
};

function Wrapper({ children }: { children: React.ReactNode }) {
    return (
        <NextIntlClientProvider locale="en" messages={messages}>
            {children}
        </NextIntlClientProvider>
    );
}

describe('SupportLauncher', () => {
    it('is a button a screen reader can name', () => {
        render(<SupportLauncher unread={0} onOpen={() => {}} />, { wrapper: Wrapper });

        expect(screen.getByRole('button', { name: 'Get help' })).toBeInTheDocument();
    });

    it('opens the panel when pressed', () => {
        const onOpen = vi.fn();
        render(<SupportLauncher unread={0} onOpen={onOpen} />, { wrapper: Wrapper });

        fireEvent.click(screen.getByRole('button'));

        expect(onOpen).toHaveBeenCalledOnce();
    });

    it('shows how many replies are waiting when it is closed', () => {
        render(<SupportLauncher unread={3} onOpen={() => {}} />, { wrapper: Wrapper });

        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('sits below the app modals rather than over them', () => {
        // MapModal and PropertyGallery are z-[100]. BoostK's widget used z-50, which would
        // float this button over an open photo gallery.
        const { container } = render(
            <SupportLauncher unread={0} onOpen={() => {}} />,
            { wrapper: Wrapper },
        );

        const root = container.firstElementChild as HTMLElement;
        expect(root.className).toContain('z-40');
        expect(root.className).not.toMatch(/z-\[?(50|60|100|1001|10000)\]?/);
    });
});
