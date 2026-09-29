import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/locales/en.json';

/**
 * Closes a gap the rest of the Idle Limit test suite leaves open.
 *
 * Every other test proves the STORE reacts correctly to a 401 (`useIdlePresence.test.ts`,
 * mocked fetch, asserts `useAuthStore.getState()`), and proves the SERVER actually revokes
 * an idle session (`session.integration.test.ts`, real Postgres). Neither proves the last
 * hop: that flipping `isAuthModalOpen` on the real store actually renders something a
 * traveller can see and use to sign back in.
 *
 * This mounts the real `AuthListener` (which calls the real, unmocked `useIdlePresence`)
 * next to the real `AuthModal` — the same two components the root layout renders on every
 * page — with only `fetch` and the toast/social-login leaves mocked. A real click, a real
 * 401, a real store update, a real re-render.
 */

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/components/auth/SocialLoginButtons', () => ({ default: () => null }));

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: routerPush }),
}));

import { AuthListener } from './AuthListener';
import AuthModal from './AuthModal';
import { useAuthStore } from '@/stores/authStore';

const testUser = {
    id: 'u1',
    email: 'ana.reyes@example.com',
    firstName: 'Ana',
    lastName: 'Reyes',
    role: 'user',
    avatarUrl: null,
    bannedAt: null,
};

function Wrapper({ children }: { children: React.ReactNode }) {
    return (
        <NextIntlClientProvider locale="en" messages={messages}>
            {children}
        </NextIntlClientProvider>
    );
}

/** `/api/auth/me` reports the signed-in user until told to start reporting idle-expired. */
function mockFetch(presenceStatus: number) {
    return vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/api/auth/presence')) {
            return {
                status: presenceStatus,
                ok: presenceStatus < 400,
                json: async () => (presenceStatus < 400 ? { success: true } : { error: 'No active session.' }),
            } as Response;
        }
        // /api/auth/me — hit by AuthListener's initSession() and fetchAndSyncRole() on mount.
        return { status: 200, ok: true, json: async () => ({ user: testUser }) } as Response;
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
    routerPush.mockClear();
    useAuthStore.setState({ user: null, isAuthModalOpen: false, authStep: 'email', redirectTo: null, isLoading: true });
});

describe('Idle Limit — end-to-end UI reaction', () => {
    it('shows the real sign-in modal once the server reports the session idled out', async () => {
        vi.stubGlobal('fetch', mockFetch(401));

        render(
            <>
                <AuthListener />
                <AuthModal />
            </>,
            { wrapper: Wrapper },
        );

        // AuthListener's init() awaits two sequential fetches (initSession, then
        // fetchAndSyncRole) — one macrotask tick per hop, so both must settle here.
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(useAuthStore.getState().user?.id).toBe('u1');
        expect(screen.queryByText('Sign in or create an account')).not.toBeInTheDocument();

        // The activity event useIdlePresence listens for — same as a real click anywhere
        // on the page.
        await act(async () => {
            window.dispatchEvent(new Event('click'));
            await new Promise((r) => setTimeout(r, 0));
        });

        // Real AuthModal, real EmailStep, real next-intl string — not a mock of any of it.
        expect(screen.getByText('Sign in or create an account')).toBeInTheDocument();
        expect(useAuthStore.getState().user).toBeNull();
        expect(routerPush).toHaveBeenCalledWith('/');
    });

    it('does not open the modal while presence pings keep succeeding', async () => {
        // Negative control: proves the test above isn't vacuously true — the modal only
        // appears because of the 401, not merely because a click happened.
        vi.stubGlobal('fetch', mockFetch(200));

        render(
            <>
                <AuthListener />
                <AuthModal />
            </>,
            { wrapper: Wrapper },
        );

        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
            await new Promise((r) => setTimeout(r, 0));
        });

        await act(async () => {
            window.dispatchEvent(new Event('click'));
            await new Promise((r) => setTimeout(r, 0));
        });

        expect(screen.queryByText('Sign in or create an account')).not.toBeInTheDocument();
        expect(useAuthStore.getState().user?.id).toBe('u1');
        expect(routerPush).not.toHaveBeenCalled();
    });
});
