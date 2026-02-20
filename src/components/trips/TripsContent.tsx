"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { Plane, Luggage, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { BookingRecord } from '@/services/booking.service';
import BookingCard from './BookingCard';
import type { TripsData } from '@/lib/trips';

type TabValue = 'upcoming' | 'past' | 'all';
const VALID_TABS: TabValue[] = ['upcoming', 'past', 'all'];

interface TripsContentProps {
  initialData: TripsData;
}

export function TripsContent({ initialData }: TripsContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get('tab');
  const activeTab: TabValue = VALID_TABS.includes(rawTab as TabValue) ? (rawTab as TabValue) : 'upcoming';

  const [visibleCount, setVisibleCount] = useState(10);

  const bookings = initialData.bookings;

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

  // Re-run server component fetch to get fresh data
  const refetch = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <main className="min-h-screen pt-4 pb-16 px-3 sm:pt-6 sm:pb-20 sm:px-4 md:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="mb-4 sm:mb-6 md:mb-8">
          <h1 className="text-[clamp(1.25rem,4vw,1.875rem)] font-display font-bold text-slate-900 dark:text-white mb-1 sm:mb-2 flex items-center gap-2 sm:gap-3">
            <Plane className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600 flex-shrink-0" />
            <span>My Trips</span>
          </h1>
          <p className="text-[clamp(0.75rem,2vw,1rem)] text-slate-500 dark:text-slate-400">
            View and manage your bookings
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 sm:gap-2 mb-4 sm:mb-5 md:mb-6 border-b border-slate-200 dark:border-white/10 overflow-x-auto">
          <button
            onClick={() => handleTabChange('upcoming')}
            className={`px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3 text-[clamp(0.6875rem,2vw,0.875rem)] font-medium transition-colors relative whitespace-nowrap flex items-center gap-1 sm:gap-1.5 ${activeTab === 'upcoming'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
          >
            <span>Upcoming</span>
            {upcomingBookings.length > 0 && (
              <span className="px-1.5 sm:px-2 py-0.5 text-[clamp(0.5625rem,1.5vw,0.75rem)] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                {upcomingBookings.length}
              </span>
            )}
            {activeTab === 'upcoming' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
            )}
          </button>
          <button
            onClick={() => handleTabChange('past')}
            className={`px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3 text-[clamp(0.6875rem,2vw,0.875rem)] font-medium transition-colors relative whitespace-nowrap ${activeTab === 'past'
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
            className={`px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3 text-[clamp(0.6875rem,2vw,0.875rem)] font-medium transition-colors relative whitespace-nowrap ${activeTab === 'all'
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

        {/* Content — data is server-fetched, loading state handled by Suspense */}
        {displayedBookings.length === 0 ? (
          <div className="text-center py-12 sm:py-16 md:py-20">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center">
              <Luggage className="w-8 h-8 sm:w-10 sm:h-10 text-slate-400" />
            </div>
            <h2 className="text-[clamp(1rem,3vw,1.25rem)] font-bold text-slate-900 dark:text-white mb-2 px-4">
              {activeTab === 'upcoming' ? 'No upcoming trips' : activeTab === 'past' ? 'No past trips' : 'No trips yet'}
            </h2>
            <p className="text-[clamp(0.8125rem,2vw,1rem)] text-slate-500 dark:text-slate-400 mb-4 sm:mb-6 px-4">
              {activeTab === 'upcoming'
                ? "Time to plan your next adventure!"
                : "Start exploring and book your first trip"}
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2.5 sm:px-6 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white text-[clamp(0.8125rem,2vw,1rem)] font-medium rounded-full transition-colors"
            >
              Explore destinations
              <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-2.5 md:space-y-3">
            {displayedBookings.slice(0, visibleCount).map((booking, index) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                onBookingUpdated={refetch}
                index={index}
              />
            ))}
            {visibleCount < displayedBookings.length && (
              <div className="flex justify-center pt-3 sm:pt-4 md:pt-6">
                <button
                  onClick={() => setVisibleCount(prev => prev + 10)}
                  className="px-4 py-2 sm:px-6 sm:py-3 text-[clamp(0.6875rem,2vw,0.875rem)] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-full transition-colors"
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
