import { Suspense } from 'react';
import { AdminLoginContent } from '@/components/admin/auth/AdminLoginContent';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export default async function AdminLoginPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
        // Check role
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile?.role === 'admin') {
            redirect('/admin/overview');
        } else {
            redirect('/');
        }
    }

    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-obsidian">
                <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <AdminLoginContent />
        </Suspense>
    );
}
