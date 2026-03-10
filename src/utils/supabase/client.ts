import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/utils/env";

export const supabase = createBrowserClient(
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY,
);
