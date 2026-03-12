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

    // 2. Fetch Weekly Analytics
    const { data: analytics, isLoading: analyticsLoading } = useQuery({
        queryKey: ['admin-analytics'],
        queryFn: async () => {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { data, error } = await supabase
                .from('unified_bookings')
                .select('created_at')
                .gte('created_at', sevenDaysAgo.toISOString())
                .order('created_at', { ascending: true });

            if (error) throw error;

            // Group by day of week
            const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
            const today = new Date().getDay();

            // Create last 7 days array
            const chartData = Array.from({ length: 7 }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (6 - i));
                return {
                    day: days[d.getDay()],
                    value: 0,
                    type: 'actual' as const
                };
            });

            data?.forEach(booking => {
                const date = new Date(booking.created_at);
                const diffDays = Math.floor((new Date().getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays < 7) {
                    const index = 6 - diffDays;
                    if (index >= 0) chartData[index].value += 1;
                }
            });

            // Normalize values to percentages (0-100) for the UI if needed, 
            // but let's just use raw counts and scale them in the component if they are too small.
            // For now, let's keep raw counts but ensure they are visible.
            const maxVal = Math.max(...chartData.map(d => d.value), 1);
            return chartData.map(d => ({
                ...d,
                displayValue: Math.round((d.value / maxVal) * 80) + 20 // scale for UI visibility
            }));
        }
    });

    // 3. Fetch Supplier Breakdown
    const { data: supplierBreakdown, isLoading: breakdownLoading } = useQuery({
        queryKey: ['admin-supplier-breakdown'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('unified_bookings')
                .select('type');

            if (error) throw error;

            const counts = data.reduce((acc: any, curr) => {
                acc[curr.type] = (acc[curr.type] || 0) + 1;
                return acc;
            }, {});

            const total = data.length || 1;

            return [
                { name: 'Hotels', value: Math.round(((counts.hotel || 0) / total) * 100), color: 'text-blue-600', bg: 'bg-blue-600' },
                { name: 'Flights', value: Math.round(((counts.flight || 0) / total) * 100), color: 'text-blue-400', bg: 'bg-blue-400' },
                { name: 'Other', value: 0, color: 'text-slate-400', bg: 'bg-slate-400' },
            ];
        }
    });

    // 4. Fetch Recent Activity
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

    // 5. Setup Real-time Subscription
    useEffect(() => {
        const channel = supabase
            .channel('admin-dashboard-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'unified_bookings' },
                () => {
                    queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
                    queryClient.invalidateQueries({ queryKey: ['admin-activity'] });
                    queryClient.invalidateQueries({ queryKey: ['admin-analytics'] });
                    queryClient.invalidateQueries({ queryKey: ['admin-supplier-breakdown'] });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [queryClient]);

    return {
        stats,
        analytics,
        supplierBreakdown,
        recentActivity,
        isLoading: statsLoading || activityLoading || analyticsLoading || breakdownLoading
    };
}
