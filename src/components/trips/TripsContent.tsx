"use client";

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { CalendarCheck, Luggage, ArrowRight, Heart, ExternalLink, Trash2, BedDouble, Plane, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'next-intl';
import { useUser, useAuthLoading } from '@/stores/authStore';
import type { BookingRecord, FlightBookingRecord } from '@/services/booking.service';
import BookingCard from './BookingCard';
import FlightBookingCard from './FlightBookingCard';
import GolfBookingCard from './GolfBookingCard';
import type { TripsData } from '@/lib/trips';
import type { TripGolfBooking } from '@/lib/trips/golfBookings';
// Realtime replaced with polling: no Supabase client needed

const TABS = ['upcoming', 'past', 'all', 'wishlist'] as const;
type TabValue = (typeof TABS)[number];

const POLL_MS = 30_000;
const PAGE_SIZE = 10;

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

type MixedBooking = BookingRecord | FlightBookingRecord | TripGolfBooking;

function isGolf(b: MixedBooking): b is TripGolfBooking {
  return 'kind' in b && b.kind === 'golf';
}

function isFlight(b: MixedBooking): b is FlightBookingRecord {
  return !isGolf(b) && 'pnr' in b;
}

// States a booking can leave without the traveller doing anything: a supplier confirming, an
// airline ticketing, a refund landing, a course saying yes. Everything else has settled.
const FLIGHT_IN_FLIGHT = new Set(['booked', 'pnr_created', 'awaiting_ticket', 'cancel_requested', 'refund_pending']);

function isInFlight(b: MixedBooking): boolean {
  if (isGolf(b)) return b.status === 'requested';
  if (isFlight(b)) return FLIGHT_IN_FLIGHT.has(b.status);
  return b.status === 'pending';
}

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900';

/** The one empty state: an icon, what is missing, what to do about it. */
function EmptyState({ icon: Icon, title, description, cta }: {
  icon: LucideIcon;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <div className="px-4 py-16 text-center sm:py-20">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-white/5">
        <Icon className="h-8 w-8 text-slate-400 dark:text-slate-500" aria-hidden />
      </div>
      <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">{title}</h2>
      <p className="mx-auto mb-6 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">{description}</p>
      <Link
        href="/"
        className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-medium text-white transition-colors hover:bg-blue-700 ${focusRing}`}
      >
        {cta}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

export function TripsContent({ initialData }: TripsContentProps) {
  const t = useTranslations('trips');
  const locale = useLocale();
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

  // Poll for status changes, but only while one is expected. Replaces the Supabase Realtime
  // subscription; router.refresh() re-runs the server component so the page gets fresh data
  // without a reload. A page of settled bookings has nothing to wait for, so it asks for nothing.
  const waiting = useMemo(
    () => [...initialData.bookings, ...initialData.flightBookings, ...initialData.golfBookings].some(isInFlight),
    [initialData],
  );
  useEffect(() => {
    if (!user || !waiting) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [user, waiting, router]);

  const rawTab = searchParams?.get('tab');
  const activeTab: TabValue = TABS.includes(rawTab as TabValue) ? (rawTab as TabValue) : 'upcoming';

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== 'wishlist') return;
    setSavedLoading(true);
    fetch('/api/saved-trips')
      .then(r => r.json())
      .then(j => setSavedTrips(j.data ?? []))
      .catch(() => { })
      .finally(() => setSavedLoading(false));
  }, [activeTab]);

  const removeSaved = async (id: string) => {
    // Optimistic: drop it from the list immediately so the UI feels instant,
    // then reconcile with the server.
    const snapshot = savedTrips;
    setSavedTrips(prev => prev.filter(item => item.id !== id));
    try {
      const res = await fetch(`/api/saved-trips/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    } catch (err) {
      console.error('[TripsContent] removeSaved failed:', err);
      setSavedTrips(snapshot); // revert
      toast.error(t('wishlist.removeError'));
    }
  };

  const handleTabChange = useCallback((tab: TabValue) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    if (tab === 'upcoming') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    router.replace(`?${params.toString()}`);
    setVisibleCount(PAGE_SIZE);
  }, [router, searchParams]);

  // Arrow keys move between tabs and wrap, Home and End jump: the pattern a tablist promises.
  const onTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = TABS.length - 1;
    const next = event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last
            : null;
    if (next === null) return;
    event.preventDefault();
    handleTabChange(TABS[next]);
    document.getElementById(`trips-tab-${TABS[next]}`)?.focus();
  };

  // Upcoming carries a count because it is what needs a traveller's attention; a count on Past
  // or All is only a total.
  const upcomingCount = initialData.upcomingBookings.length + initialData.upcomingFlightBookings.length
    + initialData.upcomingGolfBookings.length;

  const tabLabels: Record<TabValue, string> = {
    upcoming: t('tabs.upcoming'),
    past: t('tabs.past'),
    all: t('tabs.all'),
    wishlist: t('tabs.wishlist'),
  };

  const pick = <T,>(upcoming: T[], past: T[], all: T[]) =>
    activeTab === 'upcoming' ? upcoming : activeTab === 'past' ? past : all;

  // A cancelled or declined booking is shown with Past, whatever it was.
  const displayedBookings: MixedBooking[] = [
    ...pick(initialData.upcomingBookings, [...initialData.pastBookings, ...initialData.cancelledBookings], initialData.bookings),
    ...pick(initialData.upcomingFlightBookings, [...initialData.pastFlightBookings, ...initialData.cancelledFlightBookings], initialData.flightBookings),
    ...pick(initialData.upcomingGolfBookings, [...initialData.pastGolfBookings, ...initialData.cancelledGolfBookings], initialData.golfBookings),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Re-run server component fetch to get fresh data
  const refetch = useCallback(() => {
    router.refresh();
  }, [router]);

  if (!user) return null;

  const emptyTitle = activeTab === 'upcoming' ? t('emptyState.upcomingTitle')
    : activeTab === 'past' ? t('emptyState.pastTitle')
      : t('emptyState.allTitle');

  return (
    <main className="min-h-screen px-4 pt-6 pb-24 sm:px-6 sm:pt-10 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        {/* Header: the page's name, once. */}
        <h1 className="mb-6 flex items-center gap-3 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:mb-8 sm:text-3xl">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30">
            <CalendarCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden />
          </span>
          <span>{t('myTrips')}</span>
        </h1>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label={t('myTrips')}
          className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-white/10 sm:mb-8"
        >
          {TABS.map((tab, index) => {
            const active = tab === activeTab;
            return (
              <button
                key={tab}
                id={`trips-tab-${tab}`}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls="trips-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => handleTabChange(tab)}
                onKeyDown={event => onTabKeyDown(event, index)}
                className={`relative flex min-h-11 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-4 ${active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'}`}
              >
                {tab === 'wishlist' && <Heart className="h-4 w-4" aria-hidden />}
                <span>{tabLabels[tab]}</span>
                {tab === 'upcoming' && upcomingCount > 0 && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    {upcomingCount}
                  </span>
                )}
                {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-blue-600 dark:bg-blue-400" />}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id="trips-panel" aria-labelledby={`trips-tab-${activeTab}`}>
          {/* ── Wishlist tab ── */}
          {activeTab === 'wishlist' && (
            savedLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none dark:bg-slate-800" />
                ))}
              </div>
            ) : savedTrips.length === 0 ? (
              <EmptyState
                icon={Heart}
                title={t('wishlist.emptyTitle')}
                description={t('wishlist.emptyDesc')}
                cta={t('exploreDestinations')}
              />
            ) : (
              <ul className="space-y-3">
                {savedTrips.map(trip => (
                  <li
                    key={trip.id}
                    className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-700"
                  >
                    {/* Thumbnail: the saved image, with the type icon behind it as the fallback.
                        Type is told by the icon, the same way the booking cards tell it. */}
                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                      {trip.type === 'flight'
                        ? <Plane className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden />
                        : <BedDouble className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden />}
                      {trip.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={trip.image_url}
                          alt=""
                          loading="lazy"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 dark:text-white">{trip.title}</p>
                      {trip.subtitle && (
                        <p className="truncate text-sm text-slate-600 dark:text-slate-400">{trip.subtitle}</p>
                      )}
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {t('wishlist.savedOn', { date: new Date(trip.created_at).toLocaleDateString(locale) })}
                      </p>
                    </div>

                    {trip.price && (
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                          {new Intl.NumberFormat(locale, { style: 'currency', currency: trip.currency, maximumFractionDigits: 0 }).format(trip.price)}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{t('wishlist.perPerson')}</p>
                      </div>
                    )}

                    {/* Always there on a touch screen, which has no hover; on a pointer device
                        they appear on hover or when focus is inside the row. */}
                    <div className="flex shrink-0 items-center sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <Link
                        href={trip.deep_link}
                        className={`flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 ${focusRing}`}
                        aria-label={t('wishlist.searchAgain')}
                        title={t('wishlist.searchAgain')}
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden />
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeSaved(trip.id)}
                        className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-slate-300 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
                        aria-label={t('wishlist.removeFromWishlist')}
                        title={t('wishlist.removeFromWishlist')}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}

          {/* Bookings: server-fetched, so loading is the Suspense skeleton's job. */}
          {activeTab !== 'wishlist' && (displayedBookings.length === 0 ? (
            <EmptyState
              icon={Luggage}
              title={emptyTitle}
              description={activeTab === 'upcoming' ? t('emptyState.upcomingDesc') : t('emptyState.otherDesc')}
              cta={t('exploreDestinations')}
            />
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {displayedBookings.slice(0, visibleCount).map(booking => (
                isGolf(booking) ? (
                  <GolfBookingCard key={booking.id} booking={booking} />
                ) : isFlight(booking) ? (
                  <FlightBookingCard key={booking.id} booking={booking} />
                ) : (
                  <BookingCard key={booking.id} booking={booking} onBookingUpdated={refetch} />
                )
              ))}
              {visibleCount < displayedBookings.length && (
                <div className="flex justify-center pt-3 sm:pt-4">
                  <button
                    type="button"
                    onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                    className={`min-h-11 rounded-xl bg-blue-50 px-6 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30 ${focusRing}`}
                  >
                    {t('viewMore', { count: displayedBookings.length - visibleCount })}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
