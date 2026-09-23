import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIdlePresence, SESSION_LIVENESS_POLL_MS } from './useIdlePresence';
import { PRESENCE_PING_MIN_INTERVAL_MS } from './presenceThrottle';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types/auth';

/**
 * Client half of the Idle Limit (CONTEXT.md, ADR-0027). The server enforces it; this hook's
 * job is narrower — tell the server about real activity, throttled, and notice when the
 * server has signed someone out for being idle so the UI can ask them to sign in again
 * instead of quietly acting on a session that no longer exists.
 *
 * Uses the real `authStore` (a zustand store, not a mock of one) so these tests prove the
 * hook actually reaches `setUser`/`openAuthModal`, not that it calls functions shaped like
 * them. Only `fetch` — the network boundary — is mocked.
 */

const testUser: User = { id: 'u1', email: 'traveller@example.com', firstName: 'Ana', lastName: 'Reyes', role: 'user' };

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useAuthStore.setState({ user: null, isAuthModalOpen: false, authStep: 'email', redirectTo: null });
});

function mockFetch(status: number) {
    const fetchMock = vi.fn(async () => ({ status, ok: status < 400, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

describe('useIdlePresence', () => {
    it('sends no ping when nobody is signed in', () => {
        const fetchMock = mockFetch(200);
        useAuthStore.setState({ user: null });

        renderHook(() => useIdlePresence());
        window.dispatchEvent(new Event('click'));

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('pings presence on a real activity event while signed in', async () => {
        const fetchMock = mockFetch(200);
        useAuthStore.setState({ user: testUser });

        renderHook(() => useIdlePresence());
        await act(async () => {
            window.dispatchEvent(new Event('click'));
            await new Promise((r) => setTimeout(r, 0));
        });

        expect(fetchMock).toHaveBeenCalledWith('/api/auth/presence', expect.objectContaining({ method: 'POST' }));
    });

    it('throttles a second activity event inside the minimum interval', async () => {
        const fetchMock = mockFetch(200);
        useAuthStore.setState({ user: testUser });

        renderHook(() => useIdlePresence());
        await act(async () => {
            window.dispatchEvent(new Event('click'));
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            window.dispatchEvent(new Event('keydown'));
            // No state change expected on a throttled call — a tick is enough to let a
            // wrongly-unthrottled implementation's fetch fire.
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('signs the user out and opens the auth modal when a ping comes back 401', async () => {
        mockFetch(401);
        useAuthStore.setState({ user: testUser });

        renderHook(() => useIdlePresence());
        await act(async () => {
            window.dispatchEvent(new Event('click'));
            await new Promise((r) => setTimeout(r, 0));
        });

        expect(useAuthStore.getState().user).toBeNull();
        expect(useAuthStore.getState().isAuthModalOpen).toBe(true);
    });

    it('notices an idled-out session even without activity, via the liveness poll', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn(async () => ({ status: 401, ok: false, json: async () => ({}) }));
        vi.stubGlobal('fetch', fetchMock);
        useAuthStore.setState({ user: testUser });

        renderHook(() => useIdlePresence());

        await act(async () => {
            await vi.advanceTimersByTimeAsync(SESSION_LIVENESS_POLL_MS);
        });

        expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.anything());
        expect(useAuthStore.getState().user).toBeNull();
        expect(useAuthStore.getState().isAuthModalOpen).toBe(true);
    });

    it('stops listening and polling once the page unmounts it', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({}) }));
        vi.stubGlobal('fetch', fetchMock);
        useAuthStore.setState({ user: testUser });

        const { unmount } = renderHook(() => useIdlePresence());
        unmount();

        window.dispatchEvent(new Event('click'));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(SESSION_LIVENESS_POLL_MS * 2 + PRESENCE_PING_MIN_INTERVAL_MS);
        });

        expect(fetchMock).not.toHaveBeenCalled();
    });
});
