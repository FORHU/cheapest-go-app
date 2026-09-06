import { getSqlAdmin } from '@/lib/db/postgres';
import {
    DEFAULT_SUPPORT_HOURS,
    isWithinSupportHours,
    parseSupportHours,
    validateSupportHours,
    type SupportHours,
    type ValidationResult,
} from './hours';

/**
 * Reading the support schedule out of `admin_settings`.
 *
 * Kept apart from `hours.ts` so the decision itself stays a pure function of a schedule
 * and an instant — that is the part worth testing, and it should not need a database to
 * run. This module is only the lookup.
 */

/** `admin_settings.key` holding the schedule. */
export const SUPPORT_HOURS_KEY = 'support_hours';

export async function getSupportHours(): Promise<SupportHours> {
    try {
        const sql = getSqlAdmin();
        const rows = await sql.unsafe(
            `SELECT value FROM admin_settings WHERE key = $1 LIMIT 1`,
            [SUPPORT_HOURS_KEY],
        );

        const raw = (rows[0] as { value?: unknown } | undefined)?.value;
        if (raw === undefined || raw === null) return DEFAULT_SUPPORT_HOURS;

        // postgres.js hands back jsonb already parsed, except where a value was stored as
        // a JSON *string*, which `saveAdminSettings` is capable of producing.
        const value = typeof raw === 'string' ? safeParse(raw) : raw;
        return parseSupportHours(value);
    } catch (err) {
        // The schedule only gates a button. A database hiccup should not take the widget
        // down with it, so fall back to the published hours.
        console.warn('[support/availability] Falling back to default hours:', (err as Error).message);
        return DEFAULT_SUPPORT_HOURS;
    }
}

function safeParse(value: string): unknown {
    try { return JSON.parse(value); } catch { return null; }
}

/**
 * Store a schedule, after checking it.
 *
 * Rejects rather than coerces. Reading is forgiving because a bad row must not take the
 * widget down; writing is not, because an operator who sets Saturday cover and sees it
 * accepted must actually have Saturday cover.
 */
export async function saveSupportHours(value: unknown): Promise<ValidationResult> {
    const checked = validateSupportHours(value);
    if (!checked.ok) return checked;

    const sql = getSqlAdmin();
    await sql`
        INSERT INTO admin_settings (key, value)
        VALUES (${SUPPORT_HOURS_KEY}, ${JSON.stringify(checked.hours)}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;

    return checked;
}

export interface SupportAvailability {
    humanAvailable: boolean;
    hours: SupportHours;
}

export async function getSupportAvailability(at: Date = new Date()): Promise<SupportAvailability> {
    const hours = await getSupportHours();
    return { humanAvailable: isWithinSupportHours(hours, at), hours };
}
