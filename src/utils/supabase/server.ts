import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/utils/env";

export async function createClient() {
    const cookieStore = await cookies();

    return createServerClient(
        env.SUPABASE_URL,
        env.SUPABASE_ANON_KEY,
        {
            cookies: {
                get: (name) => cookieStore.get(name)?.value,
            },
        }
    );
}
