-- migrate:up
-- A third role: an account that may do support work and nothing else.
--
-- Until now `users.role` was 'user' or 'admin', and promoting a support hire meant handing
-- them the whole back office — bookings, revenue, Stripe, settings, the ability to promote
-- others. The Support Desk narrowed the *menu* for such a person; it never narrowed what
-- they could reach by typing an address.
--
-- Widening the vocabulary is safe because every existing guard asks whether the role *is*
-- admin rather than whether it is not a customer. A value they have never heard of is
-- refused everywhere, so this migration grants nothing on its own: access arrives only
-- where a guard is deliberately widened to name the new role.
--
-- `support_agent` rather than `support` or `agent`: **Agent** already means anyone staffing
-- a conversation, including an admin, so a role called `agent` would make the word mean two
-- different things depending on where it is read.

ALTER TABLE public.users
    DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
    ADD CONSTRAINT users_role_check
    CHECK (role = ANY (ARRAY['user'::text, 'admin'::text, 'support_agent'::text]));

-- migrate:down
-- Anyone left on the new role becomes a customer rather than an administrator: losing the
-- desk is recoverable, and silently gaining the back office is not.
UPDATE public.users SET role = 'user' WHERE role = 'support_agent';

ALTER TABLE public.users
    DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
    ADD CONSTRAINT users_role_check
    CHECK (role = ANY (ARRAY['user'::text, 'admin'::text]));
