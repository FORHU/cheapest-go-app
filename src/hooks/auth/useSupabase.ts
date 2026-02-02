"use client";

import { useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';

/**
 * Hook to get the Supabase client for use in components
 * Memoized to prevent unnecessary re-creations
 */
export const useSupabase = () => {
    const supabase = useMemo(() => createClient(), []);
    return supabase;
};
