"use client";

import { useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

export const AuthListener = () => {
    const { syncSession, fetchAndSyncRole } = useAuthStore();
    const supabase = createClient();

    useEffect(() => {
        // Initialize
        const initializeAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                syncSession(session);
                // Fetch authoritative role from profiles table
                if (session?.user) {
                    fetchAndSyncRole();
                }
            } catch (error) {
                console.error('Error initializing auth:', error);
            }
        };
        initializeAuth();

        // Listen
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
            syncSession(session);
            if (session?.user) {
                fetchAndSyncRole();
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [syncSession, fetchAndSyncRole]);

    return null;
};
