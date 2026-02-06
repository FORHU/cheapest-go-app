"use client";

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase-client';
import { useAuthStore } from '@/stores/authStore';

export const AuthListener = () => {
    const { syncSession } = useAuthStore();
    const supabase = createClient();

    useEffect(() => {
        // Initialize
        const initializeAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                syncSession(session);
            } catch (error) {
                console.error('Error initializing auth:', error);
            }
        };
        initializeAuth();

        // Listen
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            syncSession(session);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [syncSession]);

    return null;
};
