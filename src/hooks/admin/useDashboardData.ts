import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import { useEffect } from 'react';

const supabase = createClient();

export function useDashboardData() {
    const queryClient = useQueryClient();

    // 1. Fetch Dashboard Stats
    const { data: stats, isLoading: statsLoading } = useQuery({
        queryKey: ['admin-stats'],
        queryFn: async () => {
            // In a real app, you'd use an RPC for this for performance
            // For now, we'll do basic counts
            const { count: totalBookings } = await supabase
                .from('unified_bookings')
                .select('*', { count: 'exact', head: true });

            const { data: confirmedData } = await supabase
                .from('unified_bookings')
                .select('total_price')
                .in('status', ['confirmed', 'ticketed']);

            const revenue = confirmedData?.reduce((acc, curr) => acc + Number(curr.total_price), 0) || 0;

            const { count: pendingBookings } = await supabase
                .from('unified_bookings')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'pending');

            const { count: cancelledBookings } = await supabase
                .from('unified_bookings')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'cancelled');

            return {
                totalBookings: totalBookings || 0,
                revenue: revenue,
                pendingBookings: pendingBookings || 0,
                cancelledBookings: cancelledBookings || 0
            };
        }
    });

    // 2. Fetch Recent Activity
    const { data: recentActivity, isLoading: activityLoading } = useQuery({
        queryKey: ['admin-activity'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('unified_bookings')
                .select('id, type, status, total_price, created_at, metadata')
                .order('created_at', { ascending: false })
                .limit(5);

            if (error) throw error;

            return data.map(item => ({
                id: item.id,
                user: (item.metadata as any)?.passenger_name || (item.metadata as any)?.holder_name || 'Anonymous User',
                action: `${item.status === 'cancelled' ? 'cancelled' : 'booked'} a ${item.type}`,
                time: new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                amount: `${item.status === 'cancelled' ? '-' : ''}$${item.total_price}`,
                type: item.status === 'cancelled' ? 'cancel' : item.type
            }));
        }
    });

    // 3. Setup Real-time Subscription
    useEffect(() => {
        const channel = supabase
            .channel('admin-dashboard-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'unified_bookings' },
                () => {
                    // Invalidate both queries to trigger fresh data
                    queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
                    queryClient.invalidateQueries({ queryKey: ['admin-activity'] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    return {
        stats,
        recentActivity,
        isLoading: statsLoading || activityLoading
    };
}
