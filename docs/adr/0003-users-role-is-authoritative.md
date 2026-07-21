# users.role is the single source of truth for authorization

`profiles.role` and `users.role` both existed as separate columns containing the same value. Nothing kept them in sync after user creation — the `handle_new_user` trigger copied `role` once at insert time, but any subsequent change to one table left the other stale. This was demonstrated when a direct `UPDATE users SET role = 'admin'` had no effect on admin access because the admin layout gate was reading from `profiles.role`.

We dropped `profiles.role` and updated all role checks to read from `users.role` via the Lucia session (`getSession()`). Lucia's adapter JOINs `sessions` to `users` on every request, so `user.role` in the session is always current — no extra query needed.

## Considered Options

- **Keep both columns, add an UPDATE trigger to sync them** — rejected: two columns means two writes on every role change, and the trigger is invisible to anyone changing `users.role` directly (e.g., a migration or a psql command). The sync is never perfectly reliable.
- **Make profiles.role authoritative, read it everywhere** — rejected: `profiles.role` requires an extra DB round-trip on every authenticated request. `users.role` is already fetched by Lucia's session validation JOIN — it costs nothing extra.

## Consequences

- `profiles.role` is gone. Any direct SQL that reads it will error.
- Promoting a user to admin means one write: `UPDATE users SET role = 'admin' WHERE id = '...'`. No other table needs updating.
- The `handle_new_user` trigger no longer copies `role` into profiles on user creation.
