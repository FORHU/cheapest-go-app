import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

// Routes that require authentication
const protectedRoutes = ['/checkout', '/trips', '/account', '/profile'];

// Routes that should redirect to home if already authenticated
const authRoutes = ['/login', '/signup'];

export const updateSession = async (request: NextRequest) => {
    const { pathname } = request.nextUrl;

    let supabaseResponse = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        supabaseUrl!,
        supabaseKey!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, {
                            ...options,
                            sameSite: 'lax', // Production safety
                            secure: process.env.NODE_ENV === 'production',
                        })
                    );
                },
            },
        }
    );

    // Protected routes — let the Page (Server Component) handle the redirect
    // to avoid clashing with SSR and to allow better control over the next path.
    // We only use this for session refreshing.
    await supabase.auth.getUser();

    return supabaseResponse;
};
