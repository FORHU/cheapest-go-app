import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/utils/env";

export const createClient = () =>
    createBrowserClient(
        env.getRequired('supabaseUrl'),
        env.getRequired('supabaseAnonKey'),
    );
