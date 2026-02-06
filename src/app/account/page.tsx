import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { Header } from '@/components/landing';
import { AccountContent } from '@/components/account';

export default async function AccountSettingsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login?returnTo=/account');
    }

    // Pass only serializable user data to client component
    const initialUser = {
        id: user.id,
        email: user.email || '',
        user_metadata: user.user_metadata || {},
    };

    return (
        <div className="min-h-screen flex flex-col">
            <Header />
            <AccountContent initialUser={initialUser} />
        </div>
    );
}
