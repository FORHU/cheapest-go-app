import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSupportWaiting, SUPPORT_WAITING_POLL_MS } from './useSupportWaiting';

/**
 * The number on the sidebar badge.
 *
 * It exists to interrupt an Agent working somewhere else in the admin, so being a minute
 * stale is fine — what is not fine is it throwing, or being confidently wrong, or leaving
 * a timer running after the sidebar unmounts.
 *
 * Fake timers only where a test is about time: `waitFor` polls with real ones, so turning
 * them off globally makes every assertion here hang until it times out.
 */

let fetchMock: ReturnType<typeof vi.fn>;

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function mockCounts(waiting: number, ok = true) {
    fetchMock = vi.fn(async () => ({ ok, json: async () => ({ waiting, mine: 0 }) }));
    vi.stubGlobal('fetch', fetchMock);
}

describe('useSupportWaiting', () => {
    it('reads the count once on mount', async () => {
        mockCounts(3);
        const { result } = renderHook(() => useSupportWaiting());

        await waitFor(() => expect(result.current).toBe(3));
        expect(fetchMock).toHaveBeenCalledWith('/api/admin/support/counts');
    });

    it('shows nothing rather than a wrong number when the request fails', async () => {
        // A badge is a claim about how many people are waiting. Silent beats wrong.
        mockCounts(9, false);
        const { result } = renderHook(() => useSupportWaiting());

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(result.current).toBe(0);
    });

    it('survives the endpoint throwing', async () => {
        // Offline, or signed out in another tab. The sidebar must still render.
        fetchMock = vi.fn(async () => { throw new Error('offline'); });
        vi.stubGlobal('fetch', fetchMock);

        const { result } = renderHook(() => useSupportWaiting());

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(result.current).toBe(0);
    });

    it('keeps asking, so a queue that fills up is noticed', async () => {
        vi.useFakeTimers();
        mockCounts(1);
        renderHook(() => useSupportWaiting());

        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(SUPPORT_WAITING_POLL_MS);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('stops asking once the sidebar goes away', async () => {
        // The sidebar mounts on every admin page. A timer surviving unmount is one per
        // navigation, all of them polling forever.
        vi.useFakeTimers();
        mockCounts(1);
        const { unmount } = renderHook(() => useSupportWaiting());

        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        unmount();
        await vi.advanceTimersByTimeAsync(SUPPORT_WAITING_POLL_MS * 3);

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
