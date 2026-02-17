import { notFound } from 'next/navigation';
import { DevPolicyTestContent } from './DevPolicyTestContent';

export const dynamic = 'force-dynamic';

// DEV-ONLY PAGE
// This page is excluded from production builds.
// Used for internal testing only.

export default function DevPolicyTestPage() {
    if (process.env.NODE_ENV === 'production') {
        notFound();
    }
    return <DevPolicyTestContent />;
}
