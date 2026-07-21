-- migrate:up
-- Remove profiles.role — users.role is the single source of truth for authorization.
-- All role checks now read from users via the Lucia session (getSession()).
-- See docs/adr/0003-users-role-is-authoritative.md

ALTER TABLE public.profiles DROP COLUMN role;

-- Update the new-user trigger to stop copying role into profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- migrate:down
ALTER TABLE public.profiles ADD COLUMN role text DEFAULT 'user'::text;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, role)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.role, 'user'))
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;
