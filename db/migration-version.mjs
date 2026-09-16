/**
 * How a migration filename becomes a ledger key — defined once, for everything that needs it.
 *
 * dbmate records an applied migration in `schema_migrations` under the digits that lead its
 * filename, up to the first underscore: `20260907000001`, never the whole
 * `20260907000001_supplier_booking_attempts`. The rest of the name is a label for humans.
 *
 * Three things derive that key: the apply script's preflight and skip-check, the backfill
 * script's row writer, and the test that guards the directory. They disagreed once already —
 * both scripts keyed on the full filename, so their skip-checks could never match a row
 * dbmate had written, and the rows they wrote were in turn invisible to dbmate. One
 * definition, imported everywhere, is the fix for that class of drift; a second copy of this
 * logic anywhere is the bug coming back.
 *
 * Plain `.mjs` on purpose: the scratch scripts are run directly by node and cannot import
 * TypeScript, and vitest imports this file just as happily.
 */
import fs from 'fs';

/**
 * Markers dbmate splits a migration on.
 *
 * `\b.*$` rather than `\s*$` because `-- migrate:up transaction:false` is legal dbmate, and
 * is how a migration opts out of the wrapping transaction — required for the statements that
 * cannot run inside one, such as `CREATE INDEX CONCURRENTLY` and `ALTER TYPE ... ADD VALUE`.
 * This repo uses native enums, so that is a real prospect rather than a hypothetical. An
 * anchored `\s*$` would fail to see such a marker at all: the up section would be reported
 * missing on a file whose first line is the marker, and — worse in the apply script — a file
 * whose down marker went unrecognised would have its down section run straight after its up.
 */
export const MARKERS = {
    up: /^--\s*migrate:up\b.*$/m,
    down: /^--\s*migrate:down\b.*$/m,
};

/**
 * The ledger key for a migration filename, or null if it has none.
 *
 * Deliberately not a fixed-width slice. dbmate takes every leading digit before the first
 * underscore, so `2026090700_a.sql` and `2026090700_b.sql` genuinely collide on `2026090700`
 * while a 14-character slice would read them as distinct and wave a real collision through.
 *
 * Returns null rather than throwing or exiting, so callers can collect every bad name and
 * report them in one pass. Dying on the first offender tells you less and costs another run.
 */
export function versionOf(filename) {
    const m = /^(\d+)_/.exec(filename);
    return m ? m[1] : null;
}

/** The `.sql` files in `dir` that dbmate would consider, in the order dbmate applies them. */
export function listMigrationFiles(dir) {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

/**
 * Group filenames by ledger key, reporting every collision and every unparseable name.
 *
 * A collision is the failure this module exists for: because the key is the version alone,
 * two files sharing one mean applying either records the version and marks the other applied
 * forever — it never runs, and nothing anywhere says so.
 *
 * Returns `{ collisions: [{ version, files }], malformed: [filename] }`, both empty when the
 * directory is healthy.
 */
export function auditVersions(files) {
    const byVersion = new Map();
    const malformed = [];

    for (const f of files) {
        const version = versionOf(f);
        if (version === null) {
            malformed.push(f);
            continue;
        }
        byVersion.set(version, [...(byVersion.get(version) ?? []), f]);
    }

    const collisions = [...byVersion.entries()]
        .filter(([, group]) => group.length > 1)
        .map(([version, group]) => ({ version, files: group }));

    return { collisions, malformed };
}

/**
 * The text dbmate would run for the up migration: everything after the up marker and before
 * the down marker.
 *
 * `psql -f` cannot be used on these files because each holds both halves, and would apply a
 * change and then immediately undo it. Splitting is what makes running the up half alone
 * possible — and an up section that comes back empty is a migration that does nothing while
 * still recording its version, which is how six files in this repo were silent no-ops.
 */
export function upSection(sql) {
    const body = sql.split(MARKERS.down)[0];
    return body.replace(MARKERS.up, '').trim();
}
