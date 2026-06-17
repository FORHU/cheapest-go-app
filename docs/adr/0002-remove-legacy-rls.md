# Remove leftover Supabase Row Level Security instead of keeping it dormant

CONTEXT.md documented "No RLS — security is enforced at the API layer," but a Prisma introspection pass (`prisma db pull`) surfaced that 41 tables still had RLS literally `ENABLED` from the Supabase era, with 14 leftover `CREATE POLICY` rules — none of this was visible in `db/migrations/`, since it predates the dbmate migration history. It was completely inert: the app's only DB role (`cheapestgo`) has `BYPASSRLS` and `rolsuper`, so RLS never filtered a single query in any environment. Two of the leftover policies are always-deny (`device_push_tokens`, `search_results_cache`), and most of the remaining 39 enabled-but-policy-less tables default-deny. Production RDS provisioning was still pending (per CONTEXT.md) — provisioning a normal least-privilege role there, the standard and more secure choice, would have silently broken push-token registration, hotel search caching, and all booking flows (empty results, not errors, since that's RLS's default-deny behavior).

We disabled RLS and dropped all 14 legacy policies (`20260616000002_disable_legacy_rls.sql`) rather than documenting "remember to grant BYPASSRLS" as a provisioning step. The documented security model (API-layer session checks) is the real one; leaving a dormant, contradicting mechanism in the schema for a future role to trip over was strictly worse than removing it, and removing it changed no behavior since it was already a no-op.

## Considered Options

- **Document the BYPASSRLS requirement instead of removing RLS** — rejected: relies on whoever provisions the next RDS role remembering a non-obvious requirement; a missed step fails silently (empty result sets) rather than loudly.
- **Grant BYPASSRLS explicitly to the future production role and leave RLS configured** — rejected: keeps a second, unused security mechanism in the schema that contradicts the documented model and invites someone to "finish" it later by writing real policies, which was never the design.

## Consequences

- Any future production DB role no longer needs `BYPASSRLS`/superuser to function correctly — a genuinely least-privilege role now works the same as the current dev role.
- If row-level security is ever wanted for real, it needs to be designed and added fresh — there is no existing policy to build on.
