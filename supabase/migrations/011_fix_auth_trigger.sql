-- Fix handle_new_user function to handle metadata variations (like Google Auth)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    default_role public.user_role := 'user';
BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name, avatar_url, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, NEW.raw_user_meta_data->>'email', 'no-email@example.com'),
        COALESCE(
            NEW.raw_user_meta_data->>'first_name', 
            split_part(NEW.raw_user_meta_data->>'full_name', ' ', 1),
            NEW.raw_user_meta_data->>'name'
        ),
        COALESCE(
            NEW.raw_user_meta_data->>'last_name', 
            split_part(NEW.raw_user_meta_data->>'full_name', ' ', 2)
        ),
        COALESCE(
            NEW.raw_user_meta_data->>'avatar_url', 
            NEW.raw_user_meta_data->>'picture'
        ),
        COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, default_role)
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Fallback: Just insert the essentials if metadata causes any error
    INSERT INTO public.profiles (id, email, role)
    VALUES (
        NEW.id, 
        COALESCE(NEW.email, NEW.raw_user_meta_data->>'email', 'no-email@example.com'), 
        default_role
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
