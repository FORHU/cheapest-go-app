"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { Plane, Loader2, Luggage, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { BookingRecord } from '@/services/booking.service';
import { getUserBookings } from '@/app/actions';
import { queryKeys } from '@/lib/queryClient';
import { useUser } from '@/stores/authStore';
import BookingCard from './BookingCard';
import type { TripsData } from '@/lib/trips';

type TabValue = 'upcoming' | 'past' | 'all';
const VALID_TABS: TabValue[] = ['upcoming', 'past', 'all'];

interface TripsContentProps {
  initialData: TripsData;
}

export function TripsContent({ initialData }: TripsContentProps) {
  const user = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get('tab');
  const activeTab: TabValue = VALID_TABS.includes(rawTab as TabValue) ? (rawTab as TabValue) : 'upcoming';

  const [visibleCount, setVisibleCount] = useState(10);

  // Use React Query with server-fetched initial data
  const query = useQuery({
    queryKey: queryKeys.trips.list(user?.id),
    queryFn: async () => {
      const result = await getUserBookings();
      if (!result.success) throw new Error(result.error || 'Failed to fetch bookings');
      return (result.data || []) as BookingRecord[];
    },
    enabled: !!user,
    initialData: initialData.bookings,
    staleTime: 60 * 1000, // Consider data stale after 1 minute
  });

  const bookings = query.data ?? [];

  // Derive categorized bookings
  const upcomingBookings = useMemo(() => {
    const now = new Date();
    return bookings.filter((b: BookingRecord) => new Date(b.check_in) >= now && b.status !== 'cancelled');
  }, [bookings]);

  const pastBookings = useMemo(() => {
    const now = new Date();
    return bookings.filter((b: BookingRecord) => new Date(b.check_out) < now || b.status === 'completed');
  }, [bookings]);

  const cancelledBookings = useMemo(
    () => bookings.filter((b: BookingRecord) => b.status === 'cancelled'),
    [bookings]
  );

  const handleTabChange = useCallback((tab: TabValue) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'upcoming') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    router.replace(`?${params.toString()}`);
    setVisibleCount(10);
  }, [router, searchParams]);

  const displayedBookings = activeTab === 'upcoming'
    ? upcomingBookings
    : activeTab === 'past'
      ? [...pastBookings, ...cancelledBookings]
      : bookings;

  const refetch = async () => {
    await query.refetch();
  };

  return (
    <main className="min-h-screen pt-6 pb-20 px-4 md:px-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
            <Plane className="w-8 h-8 text-blue-600" />
            My Trips
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            View and manage your bookings
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-white/10">
          <button
            onClick={() => handleTabChange('upcoming')}
            className={`px-4 py-3 text-sm font-medium transition-colors relative ${activeTab === 'upcoming'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
          >
            Upcoming
            {upcomingBookings.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                {upcomingBookings.length}
              </span>
            )}
            {activeTab === 'upcoming' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
            )}
          </button>
          <button
            onClick={() => handleTabChange('past')}
            className={`px-4 py-3 text-sm font-medium transition-colors relative ${activeTab === 'past'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
          >
            Past
            {activeTab === 'past' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
            )}
          </button>
          <button
            onClick={() => handleTabChange('all')}
            className={`px-4 py-3 text-sm font-medium transition-colors relative ${activeTab === 'all'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
          >
            All
            {activeTab === 'all' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
            )}
          </button>
        </div>

        {/* Content */}
        {query.isLoading && !query.data ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
            <p className="text-slate-500 dark:text-slate-400">Loading your trips...</p>
          </div>
        ) : query.error ? (
          <div className="text-center py-20">
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg inline-block">
              {query.error.message || 'Failed to load trips'}
            </div>
          </div>
        ) : displayedBookings.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-6 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center">
              <Luggage className="w-10 h-10 text-slate-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              {activeTab === 'upcoming' ? 'No upcoming trips' : activeTab === 'past' ? 'No past trips' : 'No trips yet'}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mb-6">
              {activeTab === 'upcoming'
                ? "Time to plan your next adventure!"
                : "Start exploring and book your first trip"}
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-full transition-colors"
            >
              Explore destinations
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedBookings.slice(0, visibleCount).map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                onBookingUpdated={refetch}
              />
            ))}
            {visibleCount < displayedBookings.length && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={() => setVisibleCount(prev => prev + 10)}
                  className="px-6 py-3 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-full transition-colors"
                >
                  View more ({displayedBookings.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
