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
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set(name, value, options);
                        });
                    } catch {
                        // Called from a Server Component — cookies are read-only.
                        // The middleware handles token refresh instead.
                    }
                },
            },
        }
    );
}
