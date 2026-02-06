import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions';
import { Header } from '@/components/landing';
import AccountPageContent from './AccountPageContent';

/**
 * Account Settings Page - SERVER COMPONENT
 * Auth check happens server-side via middleware + getCurrentUser().
 * Interactive UI is delegated to AccountPageContent (client).
 */
export default async function AccountSettingsPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect('/login?returnTo=/account');
    }

    return (
        <div className="min-h-screen flex flex-col">
            <Header />
            <AccountPageContent user={user} />
        </div>
    );
}
