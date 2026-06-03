import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AccountContent } from '@/components/account';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
    title: 'Account Settings | CheapestGo',
    robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AccountSettingsPage() {
    const { user } = await getSession();

    if (!user) {
        redirect('/login?next=/account');
    }

    const initialUser = {
        id: user.id,
        email: user.email,
        user_metadata: {
            first_name: user.firstName,
            last_name: user.lastName,
            avatar_url: user.avatarUrl,
            role: user.role,
        },
    };

    return (
        <div className="min-h-screen flex flex-col">
            <AccountContent initialUser={initialUser} />
        </div>
    );
}
