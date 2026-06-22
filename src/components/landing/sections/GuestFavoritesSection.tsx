"use client";

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Heart } from 'lucide-react';
import { type WeekendDeal } from '@/types';
import { convertCurrency, getCurrencySymbol } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';
import { useDragScroll } from '@/hooks/useDragScroll';
import { useBookingActions } from '@/stores/bookingStore';
import { type Property } from '@/types';
import SectionHeader from './SectionHeader';

function getRatingLabel(r: number): string {
  if (r >= 9.5) return 'Exceptional';
  if (r >= 9)   return 'Superb';
  if (r >= 8.5) return 'Excellent';
  if (r >= 8)   return 'Very Good';
  if (r >= 7)   return 'Good';
  return 'Average';
}

function getRatingColor(r: number): string {
  if (r >= 9)  return 'bg-emerald-500';
  if (r >= 8)  return 'bg-green-500';
  if (r >= 7)  return 'bg-amber-500';
  return 'bg-slate-400';
}

function getFutureDates(checkIn?: string | null, checkOut?: string | null) {
  if (checkIn && checkOut) {
    const ci = new Date(checkIn);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (ci >= today) return { checkIn, checkOut };
  }
  const d = new Date();
  const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilFriday);
  const friday = d.toISOString().slice(0, 10);
  d.setDate(d.getDate() + 1);
  const saturday = d.toISOString().slice(0, 10);
  return { checkIn: friday, checkOut: saturday };
}

interface FavoriteCardProps {
  deal: WeekendDeal;
  index: number;
  variant?: 'carousel' | 'grid';
}

const FavoriteCardImpl: React.FC<FavoriteCardProps> = ({ deal, index, variant = 'carousel' }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const router = useRouter();
  const { setDates, setProperty, setSelectedRoom } = useBookingActions();
  const currency = useUserCurrency();
  const fromCur = deal.currency || 'USD';
  const symbol = getCurrencySymbol(mounted ? currency : fromCur);
  const price = mounted
    ? Math.round(convertCurrency(deal.salePrice || 0, fromCur, currency))
    : Math.round(deal.salePrice || 0);

  const dates = getFutureDates(deal.checkIn, deal.checkOut);
  const [isSaved, setIsSaved] = useState(false);

  const imageUrl =
    `/api/hotel-photo?q=${encodeURIComponent(`${deal.name} ${deal.location}`)}` +
    `&fallback=${encodeURIComponent(deal.image || '')}`;

  function navigate() {
    const property: Property = {
      id: deal.hotelCode ?? String(deal.id),
      name: deal.name,
      location: deal.location,
      description: '',
      rating: deal.rating,
      reviews: deal.reviews,
      price: deal.salePrice,
      currency: deal.currency,
      image: imageUrl,
      images: [imageUrl],
      amenities: [],
      badges: [],
      type: 'hotel',
      coordinates: { lat: 0, lng: 0 },
    };
    setProperty(property);
    setSelectedRoom(null);
    setDates(new Date(dates.checkIn), new Date(dates.checkOut));
    router.push('/checkout');
  }

  return (
    <motion.div
      initial={index === 0 ? false : { opacity: 0, x: 40 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.07 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      onClick={navigate}
      style={variant === 'carousel' ? { width: 'max(200px, calc((100% - 50px) / 5))' } : undefined}
      className={variant === 'grid' ? 'cursor-pointer' : 'shrink-0 snap-start cursor-pointer'}
    >
      <div className="h-full flex flex-col overflow-hidden bg-white dark:bg-slate-900 group rounded-sm">

        {/* Image */}
        <div className="relative h-[148px] overflow-hidden shrink-0">
          <Image
            src={imageUrl}
            alt={deal.name}
            fill
            unoptimized
            sizes="(max-width: 640px) 220px, (max-width: 768px) 240px, 260px"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            priority={index === 0}
            loading={index === 0 ? undefined : 'lazy'}
          />

          <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/75" />

          {/* Guest Favorite badge */}
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-amber-400 text-amber-900 px-2 py-0.5 rounded-md">
            <Star className="w-2.5 h-2.5 fill-amber-900" />
            <span className="text-[10px] font-semibold leading-none">Guest Favorite</span>
          </div>

          {/* Bookmark */}
          <button
            onClick={e => { e.stopPropagation(); setIsSaved(v => !v); }}
            className="absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors cursor-pointer"
            aria-label="Save"
          >
            <Heart className={`w-3.5 h-3.5 transition-colors ${isSaved ? 'text-red-400 fill-red-400' : 'text-white'}`} />
          </button>

          {/* Price overlay */}
          <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5 pt-8">
            <span className="text-[20px] text-white leading-none drop-shadow">
              From {symbol}{price.toLocaleString()}<span className="text-[11px] font-normal">/night</span>
            </span>
            <p className="text-[10px] text-white/60 leading-none mt-0.5">prices may vary</p>
          </div>
        </div>

        {/* Card body */}
        <div className="px-3 pt-2.5 pb-3 flex flex-col gap-1 flex-1">
          <h3 className="text-[12px] text-slate-900 dark:text-white leading-snug truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
            {deal.name}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {deal.location}
          </p>

          {/* Rating row + Book button */}
          <div className="flex items-center justify-between gap-2 mt-auto pt-2">
            {deal.rating > 0 ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`shrink-0 text-[11px] font-bold text-white px-1.5 py-0.5 rounded ${getRatingColor(deal.rating)}`}>
                  {deal.rating.toFixed(1)}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {getRatingLabel(deal.rating)}
                </span>
              </div>
            ) : <span />}
            <button
              onClick={e => { e.stopPropagation(); navigate(); }}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] text-white bg-amber-500 hover:bg-amber-600 px-3 py-1.5 rounded-sm transition-colors cursor-pointer leading-none"
            >
              Book Now
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const FavoriteCard = React.memo(FavoriteCardImpl);
FavoriteCard.displayName = 'FavoriteCard';

// ── Section ───────────────────────────────────────────────────────────────────

interface GuestFavoritesSectionProps { deals?: WeekendDeal[] }

const GuestFavoritesSection: React.FC<GuestFavoritesSectionProps> = ({ deals }) => {
  const rawDeals = deals || [];
  const gridRef = useRef<HTMLDivElement>(null);
  const { ref: rowRef, dragProps } = useDragScroll<HTMLDivElement>();
  const [showAll, setShowAll] = useState(false);

  if (rawDeals.length === 0) return null;

  return (
    <section className="w-full py-2 md:py-4 lg:py-5">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">

        <SectionHeader
          showAll={showAll}
          onToggleShowAll={() => {
            setShowAll(v => !v);
            if (!showAll) setTimeout(() => gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
          }}
          title={<>Guest <span className="text-amber-500">Favorites</span></>}
          subtitle="Top-rated hotels loved by travellers · updated daily"
        />

        {/* Carousel */}
        <div
          ref={rowRef}
          {...dragProps}
          className="flex overflow-x-auto snap-x snap-mandatory gap-3 pt-5 pb-3 -mt-5 -mx-4 sm:-mx-6 px-4 sm:px-6 scroll-px-4 sm:scroll-px-6 cursor-grab active:cursor-grabbing select-none"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {rawDeals.map((deal, i) => (
            <FavoriteCard key={deal.id} deal={deal} index={i} />
          ))}
        </div>

        {/* View all grid */}
        <AnimatePresence>
          {showAll && (
            <motion.div
              ref={gridRef}
              key="guest-favorites-grid"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="mt-6"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  All {rawDeals.length} favorites
                </p>
                <button
                  onClick={() => setShowAll(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  Collapse ↑
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {rawDeals.map((deal, i) => (
                  <FavoriteCard key={deal.id} deal={deal} index={i} variant="grid" />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </section>
  );
};

export default GuestFavoritesSection;
