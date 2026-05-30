-- Enable RLS on search_results_cache.
-- This table is a pure server-side cache: all reads/writes go through
-- the service role key (edge functions + Next.js API routes), which
-- bypasses RLS automatically. No anon or authenticated client access needed.

alter table search_results_cache enable row level security;

-- Deny everything for anon and authenticated roles.
-- Service role bypasses RLS, so server-side code is unaffected.
create policy "no public access" on search_results_cache
    as restrictive
    for all
    to public
    using (false)
    with check (false);
