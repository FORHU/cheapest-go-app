/**
 * Geolocation helpers that separate the two very different things
 * `navigator.geolocation.getCurrentPosition` does.
 *
 * Called cold, it raises the browser's permission prompt. Chrome counts
 * dismissals of that prompt per origin and, after a few, blocks geolocation
 * outright with:
 *
 *   "Geolocation permission has been blocked as the user has dismissed the
 *    permission prompt several times."
 *
 * Components that only want location as a *nicety* (biasing a place search
 * towards where you are) were each firing that prompt on mount, on every page,
 * which is what burned through the dismissal budget. Those callers want
 * `getPositionIfPermitted`: it reads the permission state first and resolves
 * `null` rather than prompting.
 *
 * `requestPosition` is the other half — the deliberate ask, to be called from a
 * user gesture ("Locate me", opening the voice assistant), where a prompt is
 * expected and the user can connect it to something they just did.
 */

const PASSIVE_OPTIONS: PositionOptions = {
    enableHighAccuracy: false,
    timeout: 5_000,
    maximumAge: 600_000,
};

/** Current permission state, or `null` when the Permissions API is unavailable. */
async function geolocationPermission(): Promise<PermissionState | null> {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return null;
    try {
        const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        return status.state;
    } catch {
        // Safari < 16 throws on the geolocation descriptor.
        return null;
    }
}

function currentPosition(options: PositionOptions): Promise<GeolocationPosition | null> {
    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            resolve,
            () => resolve(null),
            options,
        );
    });
}

/**
 * Resolves the user's position only if geolocation is *already* granted.
 * Never prompts: resolves `null` when the state is `prompt`, `denied`, or
 * unknown (no Permissions API). Use for optional, non-blocking enhancements.
 */
export async function getPositionIfPermitted(
    options: PositionOptions = PASSIVE_OPTIONS,
): Promise<GeolocationPosition | null> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    if ((await geolocationPermission()) !== 'granted') return null;
    return currentPosition(options);
}

/**
 * Asks for the user's position, prompting if necessary. Call only from a user
 * gesture. Resolves `null` on denial, timeout, or an already-blocked origin —
 * callers are expected to carry on without a position.
 */
export async function requestPosition(
    options: PositionOptions = { enableHighAccuracy: true, timeout: 8_000 },
): Promise<GeolocationPosition | null> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    if ((await geolocationPermission()) === 'denied') return null;
    return currentPosition(options);
}
