# v2 has its own database, refreshed from v1's

v1 keeps the Postgres on port **5433**. v2 — both the api-v2 container and `npm run dev` in either v2 repo — uses the Postgres on port **5434** that api-v2's own `docker-compose.yml` already ran. It is kept comparable to v1's by being rebuilt from it: `pg_dump` 5433, drop and recreate 5434, `pg_restore`. That refresh happens before a slice starts and again before its Side-by-side Check, so the two databases hold the same rows whenever a comparison is made.

This supersedes [ADR-0014](0014-v2-reads-v1s-schema-until-cutover.md), which called for a single shared database. That decision was made from the `.env` files while Docker was down, and did not survive contact with the running containers: api-v2's compose had been overriding the api container onto its own `postgres` service since 2026-08-11, so a second database already existed and had already drifted — 143 fewer hotels, two fewer users, and no `schema_migrations` rows at all. The choice was therefore not "one database or two" but "two databases, acknowledged or not."

Asked to choose, we took two on purpose: v2 is being rebuilt feature by feature, and a mistake in it — a bad migration, a destructive backfill, a cron run against the wrong table — must not be able to reach the data v1 develops against. Isolation is the point, and the rebuild is what makes it cheap: "we broke it, we fix it" is one dump-and-restore rather than a debugging session.

What ADR-0014 got right is retained. **dbmate in v1's `db/migrations/` is still the only author of schema.** v2 never writes a migration; 5434 receives schema changes by being rebuilt from a 5433 that `dbmate up` has already brought current, and api-v2 regenerates `schema.prisma` with `prisma db pull` afterwards. `api-v2/prisma/migrations/` stays deleted.

## Consequences

- **A slice's Side-by-side Check is only valid against a freshly refreshed 5434.** Comparing against a stale copy reports data drift as porting defects, which is the failure this ADR is designed to avoid.
- **5434 cannot be brought up by `dbmate up`.** It has a schema with no migration history, so dbmate would try to create tables that already exist. Rebuilding from a dump is the only supported path, and it carries `schema_migrations` across as data.
- **`prisma db pull` is required after every refresh**, not optional. A stale `schema.prisma` produces runtime errors that look like logic bugs — `hotels/deals` failed exactly this way with `Unknown argument`.
- **Both v2 repos point at 5434**, including `npm run dev`. Leaving the `.env` files on 5433 while only the container was isolated would give the drift without the protection.
