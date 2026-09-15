// @vitest-environment node

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { listMigrationFiles, auditVersions, upSection, MARKERS } from '../../../db/migration-version.mjs';

/**
 * Structural guards on db/migrations/, enforced off disk.
 *
 * dbmate is the schema source of truth, and it records an applied migration in
 * `schema_migrations` keyed on the version alone — the leading digits of the filename, not
 * the filename. The rest of the name is a label for humans and nothing else.
 *
 * That makes two files sharing a version an invisible data-loss bug rather than a merge
 * conflict: applying either one records the shared version, and from then on dbmate treats
 * the OTHER file as applied too. It never runs, and nothing ever says so — no error, no
 * warning, no row.
 *
 * Not hypothetical. `20260907000001` was shared by the supplier-booking-attempt audit trail
 * and the assistant-retired notice. The notice ran; the audit table never did, and the
 * booking safety net it exists to be went missing with it — see the header of
 * `20260907000004_supplier_booking_attempts.sql` for that story in full.
 *
 * The marker checks guard the same failure one step earlier: dbmate applies only the text
 * under `-- migrate:up`, so a file missing that marker — or carrying it above nothing at all
 * — is a no-op that still records its version and still reads as applied. Six files in this
 * repo were exactly that before 2026-06-16, having been written to be pasted into psql by
 * hand.
 *
 * Deliberately a pure filesystem test: no DATABASE_URL, no connection, node environment. The
 * point is that it runs on every PR in ordinary CI, before a collision can reach a database.
 *
 * The version derivation itself lives in db/migration-version.mjs, shared with the scripts
 * that write the ledger, so this test and they can never disagree about what a version is.
 */

const MIGRATIONS_DIR = path.join(__dirname, '../../../db/migrations');

const files = listMigrationFiles(MIGRATIONS_DIR);

describe('db/migrations', () => {
    it('is looking at the real migration directory', () => {
        // Anchored on the initial schema migration rather than a file count: it is the
        // oldest file here, nothing can legitimately remove it, and unlike a threshold it
        // never needs bumping. If this fails, MIGRATIONS_DIR is pointing somewhere wrong and
        // every assertion below is describing the wrong directory.
        expect(files, `${MIGRATIONS_DIR} does not look like db/migrations/ — the initial schema migration is not in it`).toContain('20260601000001_schema.sql');
    });

    it('every migration file is named <version>_<label>.sql', () => {
        // A repo convention, not a dbmate rule: dbmate accepts any number of leading digits,
        // but a fixed 14 keeps timestamp order and lexical order the same thing, which is
        // what lets the scripts compare versions as plain strings.
        const malformed = files.filter((f) => !/^\d{14}_.+\.sql$/.test(f));
        expect(malformed, 'a migration filename must start with a 14-digit timestamp and an underscore; dbmate derives the version it records from exactly those digits').toEqual([]);
    });

    it('every migration file has a unique version', () => {
        const { collisions, malformed } = auditVersions(files);

        // Named, not counted. A bare "expected 2 to be 1" at 2am tells whoever is holding
        // the pager nothing about which two files are about to eat each other.
        const problems = [
            ...collisions.map((c) => `${c.version} is shared by ${c.files.join(' and ')}`),
            ...malformed.map((f) => `${f} has no version at all — dbmate would have nothing to record`),
        ];

        expect(problems, 'two migrations share a version: dbmate records the version, not the filename, so applying one marks the other applied forever and it silently never runs. Renumber whichever file has NOT been applied yet to the next free version.').toEqual([]);
    });

    it('every migration file has a non-empty migrate:up section and a migrate:down marker', () => {
        const problems: string[] = [];

        for (const f of files) {
            const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');

            if (!MARKERS.up.test(sql)) problems.push(`${f} — no '-- migrate:up' marker`);
            else if (!upSection(sql)) problems.push(`${f} — '-- migrate:up' is there but there is nothing under it`);

            if (!MARKERS.down.test(sql)) problems.push(`${f} — no '-- migrate:down' marker`);
        }

        // The emptiness half matters as much as the marker half: dbmate is perfectly happy to
        // record a version for a file that applies no SQL whatsoever, which looks identical
        // to a migration that worked.
        expect(problems, "dbmate runs only the section under '-- migrate:up'. A file missing that marker, or carrying it above nothing, applies nothing — yet still records its version and still reads as applied.").toEqual([]);
    });
});
