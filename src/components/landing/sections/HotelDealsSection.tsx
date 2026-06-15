"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart } from 'lucide-react';
import { type WeekendDeal, type Property } from '@/types';
import { convertCurrency, getCurrencySymbol } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';
import { useDragScroll } from '@/hooks/useDragScroll';
import { useBookingActions } from '@/stores/bookingStore';
import SectionHeader from './SectionHeader';

// ── Location → country lookup ───────────────────────────────────────────────────
// Hotel deals only carry a free-text `location` (a city). We map well-known
// cities to a country so the section can personalise its title and float
// in-country stays to the top. Matched case-insensitively as a substring, so
// "Cebu City" and "Cebu" both resolve to the Philippines.
const CITY_COUNTRY: Record<string, string> = {
  // Philippines
  manila: 'Philippines',     'quezon city': 'Philippines', makati: 'Philippines',
  pasig: 'Philippines',      taguig: 'Philippines',        cebu: 'Philippines',
  mactan: 'Philippines',     boracay: 'Philippines',       palawan: 'Philippines',
  'el nido': 'Philippines',  bohol: 'Philippines',         davao: 'Philippines',
  tagaytay: 'Philippines',   batangas: 'Philippines',      batanes: 'Philippines',
  baguio: 'Philippines',     siargao: 'Philippines',       iloilo: 'Philippines',
  // Japan
  tokyo: 'Japan',            osaka: 'Japan',               kyoto: 'Japan',
  nagoya: 'Japan',           sapporo: 'Japan',             fukuoka: 'Japan',
  okinawa: 'Japan',
  // South Korea
  seoul: 'South Korea',      busan: 'South Korea',         jeju: 'South Korea',
  incheon: 'South Korea',
  // Thailand
  bangkok: 'Thailand',       phuket: 'Thailand',           'chiang mai': 'Thailand',
  pattaya: 'Thailand',       krabi: 'Thailand',
  // Vietnam
  hanoi: 'Vietnam',          'da nang': 'Vietnam',         'ho chi minh': 'Vietnam',
  'phu quoc': 'Vietnam',     'nha trang': 'Vietnam',       'hoi an': 'Vietnam',
  // Other SE/East Asia
  singapore: 'Singapore',    'kuala lumpur': 'Malaysia',   penang: 'Malaysia',
  langkawi: 'Malaysia',      bali: 'Indonesia',            jakarta: 'Indonesia',
  'hong kong': 'Hong Kong',  macau: 'Macau',               taipei: 'Taiwan',
  // Middle East
  dubai: 'United Arab Emirates', 'abu dhabi': 'United Arab Emirates', doha: 'Qatar',
};

function getDealCountry(location: string | undefined): string | null {
  if (!location) return null;
  const lower = location.toLowerCase();
  for (const city in CITY_COUNTRY) {
    if (lower.includes(city)) return CITY_COUNTRY[city];
  }
  return null;
}

// ── Browser timezone → country (zero API calls, zero permissions) ───────────────
const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  'Asia/Manila': 'Philippines',
  'Asia/Tokyo': 'Japan',
  'Asia/Seoul': 'South Korea',
  'Asia/Bangkok': 'Thailand',
  'Asia/Ho_Chi_Minh': 'Vietnam',     'Asia/Saigon': 'Vietnam',
  'Asia/Singapore': 'Singapore',
  'Asia/Kuala_Lumpur': 'Malaysia',   'Asia/Kuching': 'Malaysia',
  'Asia/Jakarta': 'Indonesia',       'Asia/Makassar': 'Indonesia',
  'Asia/Hong_Kong': 'Hong Kong',     'Asia/Macau': 'Macau',
  'Asia/Taipei': 'Taiwan',
  'Asia/Dubai': 'United Arab Emirates',
  'Asia/Qatar': 'Qatar',
};

function useUserCountry(): string | null {
  const [country, setCountry] = useState<string | null>(null);
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setCountry(TIMEZONE_TO_COUNTRY[tz] ?? null);
    } catch {
      // Intl unavailable — leave null, show all deals
    }
  }, []);
  return country;
}

// ── Rating helpers ──────────────────────────────────────────────────────────────
function getRatingLabel(r: number): string {
  if (r >= 9) return 'Exceptional';
  if (r >= 8) return 'Excellent';
  if (r >= 7) return 'Very Good';
  if (r >= 6) return 'Good';
  return 'Average';
}

// ── Card ──────────────────────────────────────────────────────────────────────
interface HotelDealCardProps {
  deal: WeekendDeal;
  index: number;
  variant?: 'carousel' | 'grid';
}

function getFutureDates(checkIn?: string | null, checkOut?: string | null): { checkIn: string; checkOut: string } {
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

const HotelDealCardImpl: React.FC<HotelDealCardProps> = ({ deal, index, variant = 'carousel' }) => {
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
  const originalPrice = mounted
    ? Math.round(convertCurrency(deal.originalPrice || 0, fromCur, currency))
    : Math.round(deal.originalPrice || 0);

  const dates = getFutureDates(deal.checkIn, deal.checkOut);
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

  const discountLabel = originalPrice > 0 && originalPrice > price
    ? `${Math.round(((originalPrice - price) / originalPrice) * 100)}% OFF`
    : '';

  const imageUrl =
    `/api/hotel-photo?q=${encodeURIComponent(`${deal.name} ${deal.location}`)}` +
    `&fallback=${encodeURIComponent(deal.image || '')}`;

  const [isSaved, setIsSaved] = useState(false);

  return (
    <motion.div
      initial={index === 0 ? false : { opacity: 0, x: 40 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.07 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      onClick={() => navigate()}
      style={variant === 'carousel' ? { width: 'max(200px, calc((100% - 50px) / 5))' } : undefined}
      className={variant === 'grid' ? 'cursor-pointer' : 'shrink-0 snap-start cursor-pointer'}
    >
      <div className="h-full flex flex-col overflow-hidden bg-white dark:bg-slate-900 group rounded-sm">

        {/* ── Image ───────────────────────────────────────────── */}
        <div className="relative h-[148px] overflow-hidden shrink-0">
          <Image src={imageUrl} alt={deal.name} fill
            sizes="(max-width: 640px) 220px, (max-width: 768px) 240px, 260px"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            priority={index === 0} loading={index === 0 ? undefined : 'lazy'} />

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/75" />

          {/* Discount badge — top left */}
          {discountLabel && (
            <div className="absolute top-1.5 left-2.5 z-10">
              <span className="px-2 py-1 bg-blue-600 text-white text-[11px] rounded-md leading-none">
                {discountLabel}
              </span>
            </div>
          )}

          {/* Bookmark button — top right */}
          <button
            onClick={e => { e.stopPropagation(); setIsSaved(v => !v); }}
            className="absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors cursor-pointer"
            aria-label="Save deal"
          >
            <Heart
              className={`w-3.5 h-3.5 transition-colors ${isSaved ? 'text-red-400 fill-red-400' : 'text-white'}`}
            />
          </button>

          {/* Price overlay — bottom of image */}
          <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5 pt-8">
            <div className="flex items-end justify-between">
              <div className="flex flex-col gap-0.5">
                {originalPrice > 0 && originalPrice > price && (
                  <span className="text-[11px] text-white line-through leading-none">
                   Starting From {symbol}{originalPrice.toLocaleString()}
                  </span>
                )}
                <span className="text-[22px] text-white leading-none drop-shadow">
                  Starting from {symbol}{price.toLocaleString()}<span className="text-[11px] font-normal">/night</span>
                </span>
              </div>
              {deal.badge && (
                <span className="text-[10px] text-white/90 mb-0.5">
                  {deal.badge}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Card body ───────────────────────────────────────── */}
        <div className="px-3 pt-2.5 pb-3 flex flex-col gap-1 flex-1">
          {/* Hotel name */}
          <h3 className="text-[12px] text-slate-900 dark:text-white leading-snug truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {deal.name}
          </h3>

          {/* Location */}
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {deal.location}
          </p>

          {/* Rating + Book button */}
          <div className="flex items-center justify-between gap-2 mt-auto pt-2">
            {deal.rating > 0 ? (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
               • {deal.rating.toFixed(1)} • {getRatingLabel(deal.rating)}
              </p>
            ) : <span />}
            <button
              onClick={e => { e.stopPropagation(); navigate(); }}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-sm transition-colors cursor-pointer leading-none"
            >
              Book Now
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const HotelDealCard = React.memo(HotelDealCardImpl);
HotelDealCard.displayName = 'HotelDealCard';

// ── Section ───────────────────────────────────────────────────────────────────
interface HotelDealsSectionProps { deals?: WeekendDeal[] }

const HotelDealsSection: React.FC<HotelDealsSectionProps> = ({ deals }) => {
  const rawDeals = deals || [];
  const gridRef = useRef<HTMLDivElement>(null);
  const { ref: rowRef, dragProps } = useDragScroll<HTMLDivElement>();
  const [showAll, setShowAll] = useState(false);

  const userCountry = useUserCountry();

  const localDeals = useMemo(() => {
    if (!userCountry) return rawDeals;
    const local = rawDeals.filter(d => getDealCountry(d.location) === userCountry);
    return local.length > 0 ? local : rawDeals;
  }, [rawDeals, userCountry]);

  // "View all" grid: local first, then the rest.
  const allDeals = useMemo(() => {
    if (!userCountry) return rawDeals;
    const local = rawDeals.filter(d => getDealCountry(d.location) === userCountry);
    const others = rawDeals.filter(d => getDealCountry(d.location) !== userCountry);
    return local.length > 0 ? [...local, ...others] : rawDeals;
  }, [rawDeals, userCountry]);

  const isPersonalized = userCountry != null &&
    rawDeals.some(d => getDealCountry(d.location) === userCountry);

  if (localDeals.length === 0) return null;

  return (
    <section className="w-full py-2 md:py-4 lg:py-5">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">

        {/* Header */}
        <SectionHeader
          showAll={showAll}
          onToggleShowAll={() => {
            setShowAll(v => !v);
            if (!showAll) setTimeout(() => gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
          }}
          title={isPersonalized
            ? <>Hotel Deals in <span className="text-blue-600 dark:text-blue-400">{userCountry}</span></>
            : 'Top Hotel Deals'}
          subtitle={isPersonalized
            ? `Top-rated stays in ${userCountry} · updated daily`
            : 'Handpicked stays at unbeatable prices'}
        />

        {/* Horizontal scroll row */}
        <div
          ref={rowRef}
          {...dragProps}
          className="flex overflow-x-auto snap-x snap-mandatory gap-3 pt-5 pb-3 -mt-5 -mx-4 sm:-mx-6 px-4 sm:px-6 scroll-px-4 sm:scroll-px-6 cursor-grab active:cursor-grabbing select-none"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {localDeals.map((deal, i) => (
            <HotelDealCard key={deal.id} deal={deal} index={i} />
          ))}
        </div>

        {/* "View all" expanded grid */}
        <AnimatePresence>
          {showAll && (
            <motion.div
              ref={gridRef}
              key="hotel-deals-grid"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="mt-6"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  All {allDeals.length} hotels
                </p>
                <button
                  onClick={() => setShowAll(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  Collapse ↑
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {allDeals.map((deal, i) => (
                  <HotelDealCard key={deal.id} deal={deal} index={i} variant="grid" />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};

export default HotelDealsSection;
