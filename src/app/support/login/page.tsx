import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginContent } from '@/components/login';
import { getSession } from '@/lib/auth/session';
import { landingFor } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Staff sign in | CheapestGo',
    robots: { index: false, follow: false },
};

/**
 * The staff door.
 *
 * Customers sign in at /login; this is the one support staff bookmark. It is the same
 * credentials, the same session and the same session cookie — the difference is where you
 * land and what you are told if you do not belong here.
 *
 * Not a security boundary. Nothing is granted by arriving through this URL rather than the
 * other one; the roles decide, and they decide identically at both doors. What this buys is
 * that a Support Agent has an address of their own and is never dropped on the marketing
 * site wondering where the inbox went.
 */
export default async function StaffLoginPage() {
    // Already signed in as staff — skip the form and go where they were heading.
    const { user } = await getSession();
    const landing = user ? landingFor(user.role) : null;
    if (landing) redirect(landing);

    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <LoginContent isAdmin />
        </Suspense>
    );
}
