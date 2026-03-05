'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';
import { createClient } from '@/utils/supabase/client';

/**
 * Hook to manage admin login form state and logic.
 * Fully decoupled from standard user login.
 */
export function useAdminLoginForm() {
    const { login, socialLogin, isLoading } = useAuthStore();
    const router = useRouter();
    const supabase = createClient();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    const handleGoogleLogin = useCallback(async () => {
        try {
            await socialLogin('google');
        } catch (error: any) {
            toast.error(error?.message || "Google Authentication failed");
        }
    }, [socialLogin]);

    const handleAdminLogin = useCallback(async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setErrors({});

        if (!email || !password) {
            setErrors({
                email: !email ? 'Admin email required' : '',
                password: !password ? 'Authorization key required' : ''
            });
            return;
        }

        try {
            // 1. Perform standard login
            await login(email, password);

            // 2. Fetch user to check role immediately
            const { data: { user }, error: userError } = await supabase.auth.getUser();

            if (userError || !user) throw new Error("Verification failed. Please try again.");

            // 3. Check role in profiles table
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            if (profileError || profile?.role !== 'admin') {
                // If not admin, sign out immediately
                await supabase.auth.signOut();
                throw new Error("Access Denied: You do not have administrative privileges.");
            }

            toast.success("Identity verified. Accessing Command Center...", {
                style: { background: '#0F172A', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
            });

            router.push('/admin/overview');
        } catch (error: any) {
            console.error('Admin login error:', error);
            const message = error?.message || "Authorization failed";
            toast.error(message, {
                style: { background: '#881337', color: '#fff', border: '0' }
            });
            setErrors({ general: message });
        }
    }, [email, password, login, router, supabase]);

    return {
        isLoading,
        email,
        setEmail,
        password,
        setPassword,
        errors,
        setErrors,
        login: handleAdminLogin,
        googleLogin: handleGoogleLogin
    };
}
