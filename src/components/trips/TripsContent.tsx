"use client";

import React, { useState, useMemo, useCallback, useTransition } from 'react';
import { Plane, Loader2, Luggage, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { getUserBookings } from '@/app/actions';
import type { BookingRecord } from '@/app/actions';
import BookingCard from './BookingCard';
import type { TripsData } from '@/lib/trips';

interface TripsContentProps {
  initialData: TripsData;
}

export function TripsContent({ initialData }: TripsContentProps) {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [visibleCount, setVisibleCount] = useState(10);
  const [bookings, setBookings] = useState<BookingRecord[]>(initialData.bookings);
  const [isRefetching, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Derive categorized bookings
  const upcomingBookings = useMemo(() => {
    const now = new Date();
    return bookings.filter((b) => new Date(b.check_in) >= now && b.status !== 'cancelled');
  }, [bookings]);

  const pastBookings = useMemo(() => {
    const now = new Date();
    return bookings.filter((b) => new Date(b.check_out) < now || b.status === 'completed');
  }, [bookings]);

  const cancelledBookings = useMemo(
    () => bookings.filter((b) => b.status === 'cancelled'),
    [bookings]
  );

  const handleTabChange = (tab: 'upcoming' | 'past' | 'all') => {
    setActiveTab(tab);
    setVisibleCount(10);
  };

  const displayedBookings = activeTab === 'upcoming'
    ? upcomingBookings
    : activeTab === 'past'
      ? [...pastBookings, ...cancelledBookings]
      : bookings;

  // Refetch via server action instead of client-side Supabase query
  const refetch = useCallback(() => {
    startTransition(async () => {
      const result = await getUserBookings();
      if (result.success && result.data) {
        setBookings(result.data);
        setError(null);
      } else {
        setError(result.error || 'Failed to refresh bookings');
      }
    });
  }, []);

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
        {error ? (
          <div className="text-center py-20">
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg inline-block">
              {error}
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
