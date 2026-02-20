"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { Plane, Luggage, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { BookingRecord, FlightBookingRecord } from '@/services/booking.service';
import BookingCard from './BookingCard';
import FlightBookingCard from './FlightBookingCard';
import type { TripsData } from '@/lib/trips';

type TabValue = 'upcoming' | 'past' | 'all';
const VALID_TABS: TabValue[] = ['upcoming', 'past', 'all'];

interface TripsContentProps {
  initialData: TripsData;
}

type MixedBooking = BookingRecord | FlightBookingRecord;

function isFlight(b: MixedBooking): b is FlightBookingRecord {
  return 'pnr' in b;
}

export function TripsContent({ initialData }: TripsContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get('tab');
  const activeTab: TabValue = VALID_TABS.includes(rawTab as TabValue) ? (rawTab as TabValue) : 'upcoming';

  const [visibleCount, setVisibleCount] = useState(10);
  const [typeFilter, setTypeFilter] = useState<'all' | 'hotels' | 'flights'>('all');

  const counts = {
    upcoming: initialData.upcomingBookings.length + initialData.upcomingFlightBookings.length,
    past: initialData.pastBookings.length + initialData.pastFlightBookings.length,
    all: initialData.bookings.length + initialData.flightBookings.length,
  };

  const displayedHotels = activeTab === 'upcoming'
    ? initialData.upcomingBookings
    : activeTab === 'past'
      ? [...initialData.pastBookings, ...initialData.cancelledBookings]
      : initialData.bookings;

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

  const displayedFlights = activeTab === 'upcoming'
    ? initialData.upcomingFlightBookings
    : activeTab === 'past'
      ? [...initialData.pastFlightBookings, ...initialData.cancelledFlightBookings]
      : initialData.flightBookings;

  const displayedBookings = [...displayedHotels, ...displayedFlights]
    .filter(b => {
      if (typeFilter === 'hotels') return !isFlight(b);
      if (typeFilter === 'flights') return isFlight(b);
      return true;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Re-run server component fetch to get fresh data
  const refetch = useCallback(() => {
    router.refresh();
  }, [router]);

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

        {/* Tabs and Filters */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 border-b border-slate-200 dark:border-white/10">
          <div className="flex gap-2">
            <button
              onClick={() => handleTabChange('upcoming')}
              className={`px-4 py-3 text-sm font-medium transition-colors relative ${activeTab === 'upcoming'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
            >
              Upcoming
              {counts.upcoming > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                  {counts.upcoming}
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

          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 mb-2">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${typeFilter === 'all' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
            >
              All Types
            </button>
            <button
              onClick={() => setTypeFilter('hotels')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${typeFilter === 'hotels' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
            >
              Hotels
            </button>
            <button
              onClick={() => setTypeFilter('flights')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${typeFilter === 'flights' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'}`}
            >
              Flights
            </button>
          </div>
        </div>

        {/* Content — data is server-fetched, loading state handled by Suspense */}
        {displayedBookings.length === 0 ? (
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
              isFlight(booking) ? (
                <FlightBookingCard key={booking.id} booking={booking} />
              ) : (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  onBookingUpdated={refetch}
                />
              )
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
