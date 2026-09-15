import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Structural guards on db/migrations/, enforced off disk.
 *
 * dbmate is the schema source of truth. It records an applied migration in
 * `schema_migrations` keyed on the BARE 14-digit timestamp prefix of the filename —
 * `20260907000001`, not `20260907000001_supplier_booking_attempts`. The rest of the
 * name is a label for humans and nothing else.
 *
 * That makes two filenames sharing a prefix an invisible data-loss bug rather than a
 * merge conflict: applying either one records the shared version, and from then on
 * dbmate considers the OTHER file applied too. It is never run, and nothing ever says
 * so — no error, no warning, no row.
 *
 * This is not hypothetical. `20260907000001` was shared by the supplier-booking-attempt
 * audit trail and the assistant-retired notice. The notice ran; the audit table never
 * did. `supplierAttempt.ts` deliberately swallows its own write failures so a booking is
 * never blocked by its own audit trail, so every INSERT into the missing table logged
 * "Proceeding untraced" and moved on — a safety net built after a live booking went
 * missing (CG-770AZS), absent for as long as the collision stood, and silent about it.
 *
 * The marker check guards the same class of failure one step earlier: dbmate applies
 * only the text under `-- migrate:up`, so a file lacking the marker is a no-op that
 * still records its version and still looks applied. Six files in this repo were
 * exactly that before 2026-06-16, having been written to be pasted into psql by hand.
 *
 * Deliberately a pure filesystem test: no DATABASE_URL, no connection. The point is
 * that it runs on every PR in ordinary CI, before a collision can ever reach a database.
 */

const MIGRATIONS_DIR = path.join(__dirname, '../../../db/migrations');

const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

describe('db/migrations', () => {
    it('finds the migration directory and it is non-trivial', () => {
        // Guards the guard. If the path above ever goes stale, every assertion below
        // passes vacuously over an empty list and this file stops protecting anything.
        expect(files.length, `no .sql files found in ${MIGRATIONS_DIR} — has the directory moved?`).toBeGreaterThan(40);
    });

    it('every migration file is named <14-digit version>_<label>.sql', () => {
        // The version is a positional slice of the filename, so the uniqueness check
        // below is only meaningful while every name actually carries one.
        const malformed = files.filter((f) => !/^\d{14}_.+\.sql$/.test(f));
        expect(malformed, 'dbmate derives a migration version from the leading 14 digits of the filename; a name without them has no version to record').toEqual([]);
    });

    it('every migration file has a unique version prefix', () => {
        const byVersion = new Map<string, string[]>();
        for (const f of files) {
            const version = f.slice(0, 14);
            byVersion.set(version, [...(byVersion.get(version) ?? []), f]);
        }

        // Named, not counted. A bare "expected 2 to be 1" at 2am tells whoever is
        // holding the pager nothing about which two files are about to eat each other.
        const collisions = [...byVersion.entries()]
            .filter(([, group]) => group.length > 1)
            .map(([version, group]) => `${version} is shared by ${group.join(' and ')}`);

        expect(collisions, 'two migrations share a version: dbmate records the version, not the filename, so applying one marks the other applied forever and it silently never runs. Renumber whichever file has NOT been applied yet to the next free version.').toEqual([]);
    });

    it('every migration file has both a migrate:up and a migrate:down marker', () => {
        const missing: string[] = [];
        for (const f of files) {
            const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
            if (!/^--\s*migrate:up\s*$/m.test(sql)) missing.push(`${f} — no '-- migrate:up'`);
            if (!/^--\s*migrate:down\s*$/m.test(sql)) missing.push(`${f} — no '-- migrate:down'`);
        }

        expect(missing, "dbmate runs only the section under '-- migrate:up'. A file missing it applies nothing, yet still records its version and still reads as applied.").toEqual([]);
    });
});
