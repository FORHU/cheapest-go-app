// DEPRECATED — replaced by src/utils/postgres/middleware.ts. Safe to delete.
export { updateSession } from '@/utils/postgres/middleware';
/*

// Routes that require authentication
const protectedRoutes = ['/checkout', '/trips', '/account'];

// Routes that should redirect to home if already authenticated
const authRoutes = ['/login'];

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
                setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // Refreshing the auth token
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Protected routes — redirect to login if not authenticated
    if (protectedRoutes.some((route) => pathname.startsWith(route))) {
        if (!user) {
            const redirectUrl = new URL('/login', request.url);
            redirectUrl.searchParams.set('returnTo', pathname);
            return NextResponse.redirect(redirectUrl);
        }
    }

    // Auth routes — redirect to home if already authenticated
    if (authRoutes.some((route) => pathname.startsWith(route)) && user) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    return supabaseResponse;
};
