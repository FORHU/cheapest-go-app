"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Plane, Luggage, ArrowRight, Heart, ExternalLink, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser, useAuthLoading } from '@/stores/authStore';
import type { BookingRecord, FlightBookingRecord } from '@/services/booking.service';
import BookingCard from './BookingCard';
import FlightBookingCard from './FlightBookingCard';
import type { TripsData } from '@/lib/trips';
import { createClient } from '@/utils/supabase/client';

type TabValue = 'upcoming' | 'past' | 'all' | 'wishlist';
const VALID_TABS: TabValue[] = ['upcoming', 'past', 'all', 'wishlist'];

interface SavedTrip {
    id: string;
    type: 'flight' | 'hotel';
    title: string;
    subtitle?: string;
    price?: number;
    currency: string;
    image_url?: string;
    deep_link: string;
    created_at: string;
}

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
  const user = useUser();
  const isLoading = useAuthLoading();

  // Redirect if logged out while on page
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  // Realtime: refresh page when any flight booking status changes (e.g. awaiting_ticket → ticketed)
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel('flight-booking-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'flight_bookings',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const oldStatus = payload.old?.status;
          const newStatus = payload.new?.status;
          if (oldStatus !== newStatus) {
            console.log(`[trips] Booking status changed: ${oldStatus} → ${newStatus}, refreshing`);
            router.refresh();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, router]);

  const rawTab = searchParams?.get('tab');
  const activeTab: TabValue = VALID_TABS.includes(rawTab as TabValue) ? (rawTab as TabValue) : 'upcoming';

  const [visibleCount, setVisibleCount] = useState(10);
  const [typeFilter, setTypeFilter] = useState<'all' | 'hotels' | 'flights'>('all');
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== 'wishlist') return;
    setSavedLoading(true);
    fetch('/api/saved-trips')
      .then(r => r.json())
      .then(j => setSavedTrips(j.data ?? []))
      .catch(() => {})
      .finally(() => setSavedLoading(false));
  }, [activeTab]);

  const removeSaved = async (id: string) => {
    await fetch(`/api/saved-trips/${id}`, { method: 'DELETE' });
    setSavedTrips(prev => prev.filter(t => t.id !== id));
  };

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
    const params = new URLSearchParams(searchParams?.toString() || '');
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

  if (!user) return null;

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
            {counts.upcoming > 0 && (
              <span className="px-1.5 sm:px-2 py-0.5 text-[clamp(0.5625rem,1.5vw,0.75rem)] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                {counts.upcoming}
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
          <button
            onClick={() => handleTabChange('wishlist')}
            className={`px-2 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-3 text-[clamp(0.6875rem,2vw,0.875rem)] font-medium transition-colors relative whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'wishlist'
              ? 'text-rose-500 dark:text-rose-400'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
          >
            <Heart size={13} className={activeTab === 'wishlist' ? 'fill-rose-500 text-rose-500' : ''} />
            Wishlist
            {activeTab === 'wishlist' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-500 dark:bg-rose-400" />
            )}
          </button>
        </div>

        {/* ── Wishlist tab ── */}
        {activeTab === 'wishlist' && (
          <div>
            {savedLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                ))}
              </div>
            ) : savedTrips.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center">
                  <Heart className="w-8 h-8 text-rose-300" />
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">No saved trips yet</h2>
                <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm">
                  Tap the heart icon on any flight or hotel to save it here.
                </p>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full transition-colors"
                >
                  Explore destinations
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                {savedTrips.map(trip => (
                  <div key={trip.id} className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 hover:border-slate-300 dark:hover:border-slate-600 transition-colors group">
                    {/* Type icon */}
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${trip.type === 'flight' ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-amber-50 dark:bg-amber-900/30'}`}>
                      {trip.type === 'flight'
                        ? <Plane size={16} className="text-blue-600 dark:text-blue-400" />
                        : <Luggage size={16} className="text-amber-600 dark:text-amber-400" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{trip.title}</p>
                      {trip.subtitle && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{trip.subtitle}</p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Saved {new Date(trip.created_at).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Price */}
                    {trip.price && (
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: trip.currency, maximumFractionDigits: 0 }).format(trip.price)}
                        </p>
                        <p className="text-[10px] text-slate-400">per person</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        href={trip.deep_link}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                        title="Search again"
                      >
                        <ExternalLink size={13} />
                      </Link>
                      <button
                        onClick={() => removeSaved(trip.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-400 hover:text-rose-500 transition-colors"
                        title="Remove from wishlist"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content — data is server-fetched, loading state handled by Suspense */}
        {activeTab !== 'wishlist' && (displayedBookings.length === 0 ? (
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
              isFlight(booking) ? (
                <FlightBookingCard
                  key={booking.id}
                  booking={booking}
                />
              ) : (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  onBookingUpdated={refetch}
                  index={index}
                />
              )
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
        ))}
      </div>
    </main>
  );
}
