import { createClient } from '@/utils/supabase/server';
import { AccountContent } from '@/components/account';

export default async function AccountSettingsPage() {
    // Auth protection handled by middleware.ts
    // This page is only accessible to authenticated users
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Pass only serializable user data to client component
    const initialUser = {
        id: user!.id,
        email: user!.email || '',
        user_metadata: user!.user_metadata || {},
    };

    return (
        <div className="min-h-screen flex flex-col">
            <AccountContent initialUser={initialUser} />
        </div>
    );
}
