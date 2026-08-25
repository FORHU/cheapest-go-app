# v2 reads v1's schema until cutover

**Status:** Superseded by [ADR-0018](0018-v2-has-its-own-database.md) — v2 now uses its own database on port 5434. The parts about dbmate remaining the sole author of schema, and `api-v2/prisma/migrations/` being deleted, still hold.

v1 and both v2 repos point at the same development database (`postgresql://cheapestgo@localhost:5433/cheapestgo`), and dbmate in `db/migrations/` remains its only writer. `cheapestgo-api-v2` uses `prisma db pull` to derive its `schema.prisma` from that database and never authors a migration of its own; the `prisma/migrations/` directory it carried (`20260629080714_init`, `add_completed_at_to_booking_sessions`, `add_ticketed_at_to_flight_bookings`) is removed. A schema change needed by v2 is written as a dbmate migration in v1, where it would have had to land before cutover anyway.

We chose this while porting v1's post-August-8 work into v2 feature by feature. The obvious alternative — giving api-v2 the separate `cheapestgo_v2` database its `.env.example` still advertises — was rejected: it forks a schema that is under active development in v1, so every one of the 32 existing migrations would have to be replayed and every subsequent one written twice, with a dual-write or sync job holding the two copies together for the duration. That is a real distributed-systems cost paid for a fork that is discarded at cutover, when v1 is switched off and v2 simply inherits the database.

Sharing a database between two services is normally an integration-database anti-pattern, and the objection does not apply here for two reasons. The anti-pattern requires two *writers* evolving a schema independently; there is one writer, and the arrangement that actually violated this — api-v2's own Prisma migrations against a dbmate-owned database — is what this ADR removes. And it requires permanence: v1 and v2 are the same application at two points in time, not peers, so the sharing terminates by construction. Two apps against one database is in any case already how production runs — GeomeeGo is a second EC2 instance on the same `DATABASE_URL` (see [ADR-0005](0005-geomeego-white-label-deployment.md)).

## Consequences

- **The 5433 database is a shared mutable dev resource.** Breaking it while working on v2 breaks v1's dev server too. Take a `pg_dump` before running `dbmate up`; restore is `docker compose down -v` plus a replay.
- **`prisma db pull` in api-v2 is a step in every slice that touches schema**, not a one-off. `schema.prisma` in api-v2 is a generated artifact on the same terms as v1's ([ADR-0001](0001-prisma-for-introspection-not-migrations.md)) — never hand-edited.
- **Live RDS is not involved.** Only the v1 container on port 3001 reaches it, via a hardcoded `environment:` block in `docker-compose.yml`; no part of the v2 port points at it.
- **This decision expires at cutover.** Once v1 is off, v2 owns the database outright and should take over `db/migrations/` — with dbmate, for the reasons in ADR-0001.
