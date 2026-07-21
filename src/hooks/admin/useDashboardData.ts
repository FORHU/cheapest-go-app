import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryKeys, staleTimes } from '@/lib/queryClient';

export function useDashboardData() {
    const queryClient = useQueryClient();

    // 1. Fetch Dashboard Stats
    const { data: stats, isLoading: statsLoading } = useQuery({
        queryKey: queryKeys.admin.stats(),
        staleTime: staleTimes.admin,
        queryFn: async () => {
            const res = await fetch('/api/admin/dashboard?section=stats');
            if (!res.ok) throw new Error('Failed to fetch stats');
            const json = await res.json();
            return json.data ?? json;
        }
    });

    // 2. Fetch Weekly Analytics
    const { data: analytics, isLoading: analyticsLoading } = useQuery({
        queryKey: queryKeys.admin.analytics(),
        staleTime: staleTimes.admin,
        queryFn: async () => {
            const res = await fetch('/api/admin/dashboard?section=analytics');
            if (!res.ok) throw new Error('Failed to fetch analytics');
            const json = await res.json();
            return json.data ?? json;
        }
    });

    // 3. Fetch Supplier Breakdown
    const { data: supplierBreakdown, isLoading: breakdownLoading } = useQuery({
        queryKey: queryKeys.admin.supplierBreakdown(),
        staleTime: staleTimes.admin,
        queryFn: async () => {
            const res = await fetch('/api/admin/dashboard?section=supplier_breakdown');
            if (!res.ok) throw new Error('Failed to fetch supplier breakdown');
            const json = await res.json();
            return json.data ?? json;
        }
    });

    // 4. Fetch Recent Activity
    const { data: recentActivity, isLoading: activityLoading } = useQuery({
        queryKey: queryKeys.admin.activity(),
        staleTime: staleTimes.admin,
        queryFn: async () => {
            const res = await fetch('/api/admin/dashboard?section=activity');
            if (!res.ok) throw new Error('Failed to fetch activity');
            const json = await res.json();
            return json.data ?? json;
        }
    });

    // 5. Poll for dashboard updates every 60 seconds (replaces Supabase Realtime channel).
    // React Query's refetchInterval handles the refresh; no WebSocket dependency.
    useEffect(() => {
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
            }
        }, 60_000);
        return () => clearInterval(interval);
    }, [queryClient]);

    return {
        stats,
        analytics,
        supplierBreakdown,
        recentActivity,
        isLoading: statsLoading || activityLoading || analyticsLoading || breakdownLoading
    };
}
