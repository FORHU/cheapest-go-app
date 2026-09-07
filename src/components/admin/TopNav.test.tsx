import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ThemeProvider } from '@/components/context/ThemeContext';
import { TopNav } from './TopNav';

/**
 * The bar across the top of both consoles.
 *
 * It is shared rather than copied so the desk and the admin cannot drift apart visually.
 * What the desk drops is everything that would be there and not work: the notifications
 * feed is behind `requireAdmin`, the command palette searches bookings and customers, and
 * the brand switcher does not scope the support inbox at all ([ADR-0030]). A control that
 * silently does nothing is worse than an empty space where it would have been.
 */

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => '/admin/desk',
}));

const messages = { theme: { contextError: 'useTheme must be used within a ThemeProvider' } };

function renderNav(variant?: 'admin' | 'desk') {
    return render(
        <NextIntlClientProvider locale="en" messages={messages}>
            <ThemeProvider>
                <TopNav variant={variant} />
            </ThemeProvider>
        </NextIntlClientProvider>
    );
}

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('TopNav', () => {
    it('gives the admin its search, notifications and brand switcher', () => {
        renderNav('admin');

        expect(screen.getByText(/search bookings/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument();
        expect(screen.getByText('CheapestGo')).toBeInTheDocument();
    });

    it('drops all three at the desk, where none of them would work', () => {
        renderNav('desk');

        expect(screen.queryByText(/search bookings/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /notifications/i })).not.toBeInTheDocument();
        expect(screen.queryByText('CheapestGo')).not.toBeInTheDocument();
    });

    it('keeps the theme toggle and the way out at the desk', () => {
        renderNav('desk');

        expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    });

    it('does not poll the admin-only notifications feed at the desk', async () => {
        // An Agent is not an admin: every one of these returns 401, once every 30 seconds,
        // for a bell that is not on screen.
        renderNav('desk');

        expect(fetch).not.toHaveBeenCalledWith('/api/admin/notifications');
    });
});
