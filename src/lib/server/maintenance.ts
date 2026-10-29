import { getAdminSettings } from '@/lib/server/admin/settings';

/**
 * Is hotel search and booking switched off?
 *
 * Toggled by hand from Admin → Settings → General, not inferred from empty results.
 * The two are indistinguishable at a single call site — an account that has stopped
 * being served availability answers exactly like a city with no rooms — and guessing
 * is how nineteen destination codes were once blacklisted for a week. A human decides.
 *
 * Hotels only. Flights are a different supplier and keep selling.
 */
export async function staysUnderMaintenance(): Promise<boolean> {
    try {
        const cfg = await getAdminSettings();
        return cfg.stays_maintenance === true;
    } catch {
        // A settings read that fails must not black out a working site.
        return false;
    }
}
