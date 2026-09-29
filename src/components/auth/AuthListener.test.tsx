import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * AuthListener mounts once, in the root layout, so it is the one place guaranteed to run
 * on every page. That makes it the wiring point for `useIdlePresence` — the Idle Limit
 * (CONTEXT.md, ADR-0027) needs to watch for activity and for a server-side sign-out on
 * every page, not just the ones that happen to render something auth-specific.
 *
 * `useIdlePresence` itself is exhaustively covered in its own test; this only pins that
 * AuthListener actually calls it, so the one-line wire-up can't be quietly dropped later.
 */

const initSession = vi.fn().mockResolvedValue(undefined);
const fetchAndSyncRole = vi.fn().mockResolvedValue(undefined);

vi.mock('@/stores/authStore', () => ({
    useAuthStore: () => ({ initSession, fetchAndSyncRole }),
}));

const useIdlePresence = vi.fn();
vi.mock('@/hooks/auth/useIdlePresence', () => ({ useIdlePresence: () => useIdlePresence() }));

import { AuthListener } from './AuthListener';

describe('AuthListener', () => {
    it('runs the Idle Limit watcher on every page it mounts on', () => {
        render(<AuthListener />);
        expect(useIdlePresence).toHaveBeenCalled();
    });
});
