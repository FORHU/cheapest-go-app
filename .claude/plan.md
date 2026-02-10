# Supabase + Next.js Architecture Refactoring Plan

## Executive Summary

Refactor the TravelBooking-Korean project to production-grade SaaS architecture with proper Supabase + Next.js 16 patterns.

**Current State:** Already server-first in many areas (server actions for mutations, server components for pages), but has critical security gaps and architectural inconsistencies.

**Goal:** Eliminate all client-side Supabase database queries, implement middleware auth protection, fix security vulnerabilities, add proper caching, and follow Vercel/Supabase best practices.

---

## Critical Findings from Audit

### 🔴 CRITICAL Issues (Must Fix)
1. **No middleware.ts** — Routes lack centralized auth protection
2. **Unprotected /checkout** — Users can access checkout without authentication
3. **Open redirect vulnerability** — OAuth callback doesn't validate `next` parameter
4. **Unprotected API endpoint** — `/api/test-email` has no auth check
5. **No .env.example** — Missing documentation for required environment variables
6. **No security headers** — Missing HSTS, CSP, X-Frame-Options in next.config.mjs

### 🟡 Medium Issues
1. Verbose debugging logs in production code (OAuth callback)
2. Silent auth failures return empty data instead of errors
3. Client-side Supabase auth operations (intentional, but need documentation)
4. No rate limiting on auth endpoints

### ✅ Good Patterns Already in Place
- Server Actions for all mutations (booking, cancellation, amendment)
- RLS policies on bookings table
- Ownership verification in server actions
- Server components for initial data fetching
- Service role key server-side only
- Anon key correctly used for client auth

---

## Refactoring Plan — 5 Phases

---

## **Phase 1: Security Fundamentals** (CRITICAL PRIORITY)

### 1.1 Create Auth Middleware
**File:** `src/middleware.ts`

**Implementation:**
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that require authentication
const protectedRoutes = ['/checkout', '/trips', '/account']

// Routes that should redirect to home if already authenticated
const authRoutes = ['/login']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Create response
  let response = NextResponse.next({ request })

  // Create Supabase client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()

  // Protected routes — redirect to login if not authenticated
  if (protectedRoutes.some(route => pathname.startsWith(route))) {
    if (!user) {
      const redirectUrl = new URL('/login', request.url)
      redirectUrl.searchParams.set('returnTo', pathname)
      return NextResponse.redirect(redirectUrl)
    }
  }

  // Auth routes — redirect to home if already authenticated
  if (authRoutes.some(route => pathname.startsWith(route)) && user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

**Changes:**
- Centralized auth protection
- Remove page-level auth redirects from `/checkout`, `/trips`, `/account` pages (middleware handles it)
- Auto-refresh tokens via middleware

### 1.2 Fix Open Redirect Vulnerability
**File:** `src/app/auth/callback/route.ts`

**Changes:**
```typescript
// Line 30: Validate next parameter
const next = searchParams.get('next') ?? '/';

// Add validation function
function validateRedirectUrl(url: string): string {
  // Only allow relative paths starting with /
  if (!url.startsWith('/') || url.startsWith('//')) {
    return '/';
  }
  // Prevent protocol-relative URLs
  if (url.includes('://')) {
    return '/';
  }
  return url;
}

const safeNext = validateRedirectUrl(next);

// Use safeNext in redirects (lines 48, 65)
return NextResponse.redirect(`${origin}${safeNext}`);
```

**Also fix:** `src/stores/authStore.ts` lines 27, 110, 151 — validate redirects in `buildRedirectUrl`

### 1.3 Remove/Protect Test Email Endpoint
**File:** `src/app/api/test-email/route.ts`

**Option A (Recommended):** Delete the file entirely (testing done via server action directly)

**Option B:** Add auth protection:
```typescript
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ... rest of implementation
}
```

### 1.4 Create .env.example
**File:** `.env.example`

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-anon-key

# Server-only keys (NEVER expose to client)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Email Service
RESEND_API_KEY=your-resend-api-key

# LiteAPI (stored in Supabase Edge Functions, not here)
# LITEAPI_KEY is in Supabase dashboard > Edge Functions > Secrets
```

### 1.5 Add Security Headers
**File:** `next.config.mjs`

```javascript
const nextConfig = {
  // ... existing config
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ],
      },
    ]
  },
}
```

**Deliverables:**
- ✅ middleware.ts created with auth protection
- ✅ Open redirect vulnerability fixed
- ✅ Test email endpoint removed/protected
- ✅ .env.example created
- ✅ Security headers added

---

## **Phase 2: Client-Side Supabase Cleanup**

### 2.1 Document Intentional Client-Side Usage

**Files with client-side Supabase (KEEP — these are correct):**
1. `src/stores/authStore.ts` — Auth operations (login, register, OAuth, logout)
2. `src/components/auth/AuthListener.tsx` — Session listener
3. `src/hooks/auth/useSupabase.ts` — Auth hook for client components

**Add JSDoc comments to clarify:**
```typescript
/**
 * Auth Store - Client-Side Supabase Operations
 *
 * This store handles authentication operations that MUST run client-side:
 * - User login/registration (requires browser cookies)
 * - OAuth redirects (requires browser navigation)
 * - Session management (real-time listener)
 *
 * ⚠️ DO NOT add database queries here. Use server actions for data fetching.
 */
```

### 2.2 Remove client-functions.ts Usage in Client Components

**File:** `src/utils/supabase/client-functions.ts`

**Issue:** This file calls edge functions with client-side auth token. It's currently only used by `DestinationPicker.tsx` for autocomplete.

**Solution:** Keep for autocomplete only (user-triggered), but add warning comment:
```typescript
/**
 * Client-side Edge Function invocation.
 *
 * ⚠️ WARNING: Only use for user-triggered, non-sensitive operations.
 * DO NOT use for:
 * - Initial data fetching (use server components)
 * - Mutations (use server actions)
 * - Sensitive queries (use server actions)
 *
 * Current valid uses:
 * - Autocomplete/search as user types (DestinationPicker)
 */
```

### 2.3 Audit and Document All Client Supabase Calls

**Run audit:**
```bash
# Search for client Supabase usage
grep -r "from '@/utils/supabase/client'" src/
grep -r "createClient()" src/components/
grep -r "createClient()" src/hooks/
```

**Document each usage with decision:**
- ✅ Auth operations → KEEP (client-only)
- ✅ Session listener → KEEP (real-time)
- ❌ Database queries → MOVE to server actions
- ⚠️ Edge function calls → EVALUATE (user-triggered OK, initial fetch NOT OK)

**Deliverables:**
- ✅ Client-side Supabase usage documented
- ✅ Comments added explaining intentional usage
- ✅ No unauthorized client-side database queries

---

## **Phase 3: Server Utilities Organization**

### 3.1 Create Server Utility Modules

**Goal:** Extract reusable logic from server actions into organized utility modules.

#### Create `src/lib/server/auth.ts`
```typescript
'use server';

import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

/**
 * Server-only auth utilities.
 * These functions MUST only be called from server components or server actions.
 */

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, supabase, error: 'Not authenticated' };
  }

  return { user, supabase, error: null };
}

export async function requireAuth() {
  const { user, supabase } = await getAuthenticatedUser();

  if (!user) {
    redirect('/login');
  }

  return { user, supabase };
}

export async function getServerSession() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}
```

#### Create `src/lib/server/bookings.ts`
```typescript
'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from './auth';
import type { Database } from '@/types/supabase';

type BookingRow = Database['public']['Tables']['bookings']['Row'];

export async function getUserBookingsQuery(): Promise<BookingRow[]> {
  const { user, supabase, error } = await getAuthenticatedUser();

  if (error || !user) {
    throw new Error('Authentication required');
  }

  const { data, error: queryError } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (queryError) {
    console.error('[getUserBookingsQuery] Error:', queryError);
    throw new Error('Failed to fetch bookings');
  }

  return data || [];
}

export async function verifyBookingOwnership(
  bookingId: string
): Promise<{ isOwner: boolean; userId: string | null }> {
  const { user, supabase, error } = await getAuthenticatedUser();

  if (error || !user) {
    return { isOwner: false, userId: null };
  }

  const { data, error: fetchError } = await supabase
    .from('bookings')
    .select('user_id')
    .eq('booking_id', bookingId)
    .single();

  if (fetchError || !data) {
    return { isOwner: false, userId: user.id };
  }

  return { isOwner: data.user_id === user.id, userId: user.id };
}
```

#### Create `src/lib/server/edge-functions.ts`
```typescript
'use server';

/**
 * Server-only edge function invocation.
 * This replaces client-side invokeEdgeFunction for all non-user-triggered calls.
 */

export async function invokeEdgeFunctionServer<T = any>(
  functionName: string,
  body?: any,
  options?: { headers?: Record<string, string>; method?: 'POST' | 'GET' }
): Promise<{ data: T }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

  const functionUrl = `${supabaseUrl}/functions/v1/${functionName}`;
  const method = options?.method || 'POST';

  const response = await fetch(functionUrl, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      ...options?.headers
    },
    body: body ? JSON.stringify(body) : undefined,
    // Add Next.js caching/revalidation
    cache: 'no-store', // or 'force-cache' with revalidate
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || response.statusText);
  }

  const responseData = await response.json();

  return { data: responseData.data || responseData };
}
```

### 3.2 Refactor Server Actions to Use Utilities

**Update:** `src/app/actions/booking.ts`

**Before:**
```typescript
async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  // ...
}
```

**After:**
```typescript
import { getAuthenticatedUser, requireAuth } from '@/lib/server/auth';
import { verifyBookingOwnership } from '@/lib/server/bookings';
import { invokeEdgeFunctionServer } from '@/lib/server/edge-functions';

// Remove duplicate getAuthenticatedUser function
// Use imports instead
```

**Benefits:**
- Reusable auth checks across all server actions
- Consistent error handling
- Easier to test in isolation
- Single source of truth for server-side logic

**Deliverables:**
- ✅ Server utility modules created
- ✅ Server actions refactored to use utilities
- ✅ Duplicate logic removed
- ✅ Consistent patterns across codebase

---

## **Phase 4: Caching & Performance Optimization**

### 4.1 Add Caching to Server Components

**Update:** `src/app/trips/page.tsx`

**Current:**
```typescript
const tripsData = await fetchTripsData();
```

**Enhanced with caching:**
```typescript
const tripsData = await fetchTripsData();
// This function should use fetch with revalidate

// Or use unstable_cache for database queries
import { unstable_cache } from 'next/cache';

const getCachedTrips = unstable_cache(
  async (userId: string) => {
    return await getUserBookingsQuery();
  },
  ['user-trips'],
  { revalidate: 60, tags: ['trips'] }
);
```

### 4.2 Use Tagged Cache Invalidation

**Update server actions:**
```typescript
import { revalidateTag } from 'next/cache';

export async function confirmBooking(params: BookingParams) {
  // ... booking logic

  // Instead of revalidatePath
  revalidateTag('trips'); // Invalidates all queries tagged with 'trips'

  return result;
}
```

### 4.3 Add Suspense Boundaries

**Update:** `src/app/trips/page.tsx`

```typescript
import { Suspense } from 'react';
import { TripsSkeleton } from '@/components/trips/TripsSkeleton';

export default async function TripsPage() {
  return (
    <Suspense fallback={<TripsSkeleton />}>
      <TripsContent />
    </Suspense>
  );
}

async function TripsContent() {
  const tripsData = await fetchTripsData();
  return <TripsContentClient initialData={tripsData} />;
}
```

### 4.4 Implement Parallel Data Fetching

**Example:** `/search` page already does this well, apply pattern elsewhere:

```typescript
// Good: Parallel fetching
const [properties, facilities] = await Promise.all([
  fetchProperties(searchParams),
  fetchFacilities(),
]);
```

**Deliverables:**
- ✅ Server component caching implemented
- ✅ Tagged cache invalidation in use
- ✅ Suspense boundaries added
- ✅ Parallel fetching optimized

---

## **Phase 5: Final Security Hardening**

### 5.1 Remove Verbose Logging

**File:** `src/app/auth/callback/route.ts`

**Remove lines 9-11, 36-37, 43, 47, 52, 58, 61, 64, 68, 72:**
```typescript
// DELETE these console.log statements
console.log('=== Auth Callback ===');
console.log('Full URL:', request.url);
// etc.
```

**Keep only error logging:**
```typescript
if (error) {
  console.error('Auth error:', error_code, error_description);
  // ...
}
```

### 5.2 Improve Error Handling in fetchTripsData

**File:** `src/lib/trips/fetchTripsData.ts`

**Current (line 24-31):** Silently returns empty data

**Better:**
```typescript
if (!user) {
  // Don't silently fail — redirect or throw
  redirect('/login?returnTo=/trips');
  // Or return error state for handling in component
  return {
    bookings: [],
    error: 'Authentication required',
    authenticated: false
  };
}
```

### 5.3 Add RLS Policy for booking_emails Table

**Create migration:** `supabase/migrations/002_secure_booking_emails.sql`

```sql
-- Enable RLS on booking_emails table
ALTER TABLE booking_emails ENABLE ROW LEVEL SECURITY;

-- Users can only view their own booking emails
CREATE POLICY "Users can view own booking emails"
  ON booking_emails
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.booking_id = booking_emails.booking_id
      AND bookings.user_id = auth.uid()
    )
  );

-- Only service role can insert (via server action with service key)
-- No INSERT policy = implicit deny for users
```

### 5.4 Security Checklist Documentation

**Create:** `SECURITY.md`

```markdown
# Security Checklist

## Environment Variables
- [ ] All secrets in .env.local (NOT .env)
- [ ] .env.local in .gitignore
- [ ] Service role key NEVER exposed to client
- [ ] Production secrets stored in Vercel/hosting env vars

## Authentication
- [x] Middleware protects sensitive routes
- [x] Server actions verify authentication
- [x] Ownership verified before mutations
- [x] OAuth redirects validated
- [ ] Rate limiting on auth endpoints (TODO)

## Database
- [x] RLS enabled on bookings table
- [x] RLS policies for SELECT, INSERT, UPDATE
- [ ] RLS enabled on booking_emails table (Phase 5)

## Headers & Security
- [x] Security headers configured
- [x] HTTPS enforced (via headers)
- [ ] CSP configured for inline scripts (if needed)

## API & Edge Functions
- [x] LiteAPI key in Edge Functions only
- [x] Service role key in server actions only
- [x] All mutations via server actions

## Code Security
- [x] No SQL injection (using Supabase client)
- [x] No XSS (React escapes by default)
- [x] No CSRF (Supabase cookies are HTTP-only)
- [x] Input validation with Zod schemas
```

**Deliverables:**
- ✅ Verbose logging removed
- ✅ Error handling improved
- ✅ RLS policy for booking_emails added
- ✅ Security checklist documented

---

## Implementation Order

**Week 1: Critical Security (Phase 1)**
- Day 1-2: Middleware + route protection
- Day 3: Fix open redirect vulnerability
- Day 4: Security headers + .env.example
- Day 5: Testing & verification

**Week 2: Architecture Cleanup (Phases 2-3)**
- Day 1-2: Document client Supabase usage
- Day 3-5: Server utilities organization

**Week 3: Performance & Hardening (Phases 4-5)**
- Day 1-3: Caching implementation
- Day 4-5: Security hardening + testing

---

## Testing Strategy

### After Phase 1:
```bash
# Test protected routes
curl -I http://localhost:3000/checkout  # Should redirect to /login
curl -I http://localhost:3000/trips     # Should redirect to /login

# Test open redirect fix
curl -I "http://localhost:3000/auth/callback?next=//evil.com"  # Should redirect to /
```

### After Phase 2-3:
```bash
# Verify no client-side DB queries
grep -r "supabase.from" src/components/  # Should return empty
grep -r "supabase.from" src/hooks/       # Should return empty
```

### After Phase 4:
- Verify cache headers: `curl -I http://localhost:3000/trips`
- Check performance: Lighthouse score
- Test cache invalidation: Book → verify /trips updates

### After Phase 5:
- Run security audit: `npm audit`
- Check headers: `https://securityheaders.com`
- Verify RLS: Try to access other user's bookings

---

## Success Criteria

- [ ] All routes properly protected (middleware enforces auth)
- [ ] No client-side database queries (only auth operations)
- [ ] Open redirect vulnerability fixed
- [ ] Security headers score A+ on securityheaders.com
- [ ] .env.example created and documented
- [ ] Server utilities organized and reusable
- [ ] Caching implemented (60s revalidate on trips)
- [ ] RLS policies on all tables
- [ ] Zero console.log in production code
- [ ] TypeScript 0 errors
- [ ] All tests passing

---

## Files to Create

1. `src/middleware.ts` — Auth middleware
2. `.env.example` — Environment variable documentation
3. `src/lib/server/auth.ts` — Server auth utilities
4. `src/lib/server/bookings.ts` — Server booking utilities
5. `src/lib/server/edge-functions.ts` — Server edge function wrapper
6. `supabase/migrations/002_secure_booking_emails.sql` — RLS for emails
7. `SECURITY.md` — Security documentation

## Files to Modify

1. `next.config.mjs` — Add security headers
2. `src/app/auth/callback/route.ts` — Fix open redirect
3. `src/stores/authStore.ts` — Validate redirects
4. `src/app/actions/booking.ts` — Use server utilities
5. `src/app/actions/email.ts` — Use server utilities
6. `src/lib/trips/fetchTripsData.ts` — Better error handling
7. `src/utils/supabase/client-functions.ts` — Add warning comment
8. `src/app/trips/page.tsx` — Add caching + Suspense
9. `src/app/checkout/page.tsx` — Remove page-level auth (middleware handles it)
10. `src/app/account/page.tsx` — Remove page-level auth (middleware handles it)

## Files to Delete

1. `src/app/api/test-email/route.ts` — Unprotected test endpoint

---

## Risk Mitigation

**Risk:** Breaking existing auth flow
- **Mitigation:** Test all auth paths (login, register, OAuth, logout) after Phase 1

**Risk:** Middleware performance impact
- **Mitigation:** Middleware only checks auth, doesn't fetch data. Use edge runtime.

**Risk:** Cache invalidation bugs
- **Mitigation:** Start with conservative revalidate times (60s), tune based on usage

**Risk:** Open redirect fix breaks legitimate redirects
- **Mitigation:** Whitelist known-safe paths, test with real OAuth flows

---

## Documentation Updates

After completion, update:
1. `MEMORY.md` — Add new architectural patterns
2. `README.md` — Add security section
3. `CONTRIBUTING.md` — Add guidelines for server/client boundary

---

## Production Deployment Checklist

Before deploying Phase 1 changes:

- [ ] Backup database (Supabase dashboard)
- [ ] Test middleware in dev thoroughly
- [ ] Verify edge functions still work
- [ ] Check auth flow on mobile browsers
- [ ] Run E2E test suite
- [ ] Deploy to staging first
- [ ] Monitor error logs for 24h before prod
