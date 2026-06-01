-- Migration: 20260602000004_data_migration_auth_users.sql
--
-- Data migration: copy existing users from Supabase's auth.users table
-- into the new public.users table.
--
-- Run ONCE when migrating an existing Supabase project.
-- Safe to run on a fresh PostgreSQL installation — INSERT will simply
-- insert nothing if auth.users doesn't exist or is empty.
--
-- IMPORTANT: Users will need to reset their passwords after migration
-- because Supabase's password hash format (bcrypt) differs from our
-- argon2id format. Send a "password reset" email to all migrated users.

DO $$
BEGIN
    -- Only proceed if auth.users table exists (Supabase environment)
    IF EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'auth' AND table_name = 'users'
    ) THEN
        INSERT INTO public.users (
            id,
            email,
            password_hash,  -- Supabase bcrypt hash — incompatible with argon2id
            role,
            first_name,
            last_name,
            avatar_url,
            email_verified,
            created_at,
            updated_at
        )
        SELECT
            au.id,
            au.email,
            NULL,  -- Force password reset; do NOT migrate Supabase hashes
            COALESCE(
                (au.raw_app_meta_data->>'role'),
                (au.raw_user_meta_data->>'role'),
                'user'
            ),
            au.raw_user_meta_data->>'first_name',
            au.raw_user_meta_data->>'last_name',
            au.raw_user_meta_data->>'avatar_url',
            (au.email_confirmed_at IS NOT NULL),
            au.created_at,
            au.updated_at
        FROM auth.users au
        ON CONFLICT (id) DO NOTHING;

        RAISE NOTICE 'Migrated % users from auth.users to public.users',
            (SELECT COUNT(*) FROM auth.users);
        RAISE NOTICE 'ACTION REQUIRED: Send password-reset emails to all migrated users.';
        RAISE NOTICE 'Users with NULL password_hash cannot log in until they reset their password.';
    ELSE
        RAISE NOTICE 'auth.users table not found — skipping data migration (fresh install OK).';
    END IF;
END;
$$;

-- After migration, update existing FK references if they pointed to auth.users
-- The profiles table already references auth.users via the trigger — update it:
-- (Only needed if you had FK constraints to auth.users)
-- ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
-- ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey
--     FOREIGN KEY (id) REFERENCES public.users(id) ON DELETE CASCADE;
