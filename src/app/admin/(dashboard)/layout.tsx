export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { createClient } from '@/utils/supabase/server';

export const metadata: Metadata = {
  title: 'Admin | CheapestGo',
  robots: { index: false, follow: false },
};
import { redirect } from 'next/navigation';
import { AdminLayoutClient } from './AdminLayoutClient';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    let user = null;

    try {
        const { data } = await supabase.auth.getUser();
        user = data.user;
    } catch (err) {
        console.error('[AdminLayout] Auth error during getUser:', err);
    }

    if (!user) {
        redirect('/login?redirect=/admin');
    }

    // Secondary check for admin role
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, full_name, avatar_url')
        .eq('id', user.id)
        .single();

    if (!profile || profile.role !== 'admin') {
        redirect('/');
    }
    
    // Convert DB profile to application User type shape for consistency
    // Note: authStore expectations (firstName/lastName) are preserved here
    const userProfile = {
        role: profile.role,
        firstName: profile.full_name?.split(' ')[0] || '',
        lastName: profile.full_name?.split(' ').slice(1).join(' ') || '',
        avatar: profile.avatar_url
    };

    return <AdminLayoutClient profile={userProfile}>{children}</AdminLayoutClient>;
}
