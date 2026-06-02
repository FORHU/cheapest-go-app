"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import SaveButton from '@/components/common/SaveButton';
import SaveButton from '@/components/common/SaveButton';
import { type WeekendDeal } from '@/types';
import { convertCurrency, getCurrencySymbol } from '@/lib/currency';
import { convertCurrency, getCurrencySymbol } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';

// ── Helpers ───────────────────────────────────────────────────────────────────
function getRatingLabel(r: number): string {
  if (r >= 9) return 'Exceptional';
  if (r >= 8) return 'Excellent';
  if (r >= 7) return 'Very Good';
  if (r >= 6) return 'Good';
  return 'Average';
}

function getRatingColor(r: number): string {
  if (r >= 9) return 'bg-emerald-600';
  if (r >= 8) return 'bg-blue-600';
  if (r >= 7) return 'bg-blue-500';
  if (r >= 6) return 'bg-amber-500';
  return 'bg-orange-500';
}

// ── Card ──────────────────────────────────────────────────────────────────────
interface FlashGetawayCardProps {
  deal: WeekendDeal;
  index: number;
  variant?: 'carousel' | 'grid';
}

const FlashGetawayCard: React.FC<FlashGetawayCardProps> = ({ deal, index, variant = 'carousel' }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const currency = useUserCurrency();
  const symbol = getCurrencySymbol(mounted ? currency : 'KRW');
  const price = mounted
    ? Math.round(convertCurrency(deal.salePrice || 0, 'KRW', currency))
    : Math.round(deal.salePrice || 0);
  const originalPrice = mounted
    ? Math.round(convertCurrency(deal.originalPrice || 0, 'KRW', currency))
    : Math.round(deal.originalPrice || 0);

  const deepLink = `/hotels?q=${encodeURIComponent(deal.location)}`;

  return (
    <motion.div
      initial={index === 0 ? false : { opacity: 0, x: 40 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.07 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      style={variant === 'carousel' ? { width: 'clamp(200px, calc(20% - 10px), 260px)' } : undefined}
      className={variant === 'grid' ? 'cursor-pointer' : 'shrink-0 snap-start cursor-pointer'}
      onClick={() => toast.info(deal.name, { description: 'Live hotel search will be available at launch.' })}
    >
      <div className="h-full flex flex-col rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm dark:shadow-none group">

        {/* ── Image ───────────────────────────────────────────── */}
        <div className="relative h-[155px] overflow-hidden shrink-0">
          {deal.image ? (
            <Image
              src={deal.image}
              alt={deal.name}
              fill
              sizes="(max-width: 640px) 220px, (max-width: 768px) 240px, 260px"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
              priority={index === 0}
              loading={index === 0 ? undefined : 'lazy'}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-blue-900 to-slate-900" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/75" />

          {/* Badge */}
          {deal.badge && (
            <div className="absolute top-3 left-3">
              <span className="px-2.5 py-1 bg-blue-600 text-white text-xs font-normal rounded-full shadow">
                {deal.badge}
              </span>
            </div>
          )}

          {/* Save button */}
          <div className="absolute top-3 right-3" onClick={e => e.stopPropagation()}>
            <SaveButton
              type="hotel"
              title={deal.name}
              subtitle={deal.location}
              price={price}
              currency={currency}
              imageUrl={deal.image || undefined}
              deepLink={deepLink}
              size="sm"
            />
          </div>

          {/* Price overlay */}
          <div className="absolute bottom-3 left-3 flex items-baseline gap-1.5">
            {originalPrice > 0 && originalPrice > price && (
              <span className="text-xs text-white/60 line-through">
                {symbol}{originalPrice.toLocaleString()}
              </span>
            )}
            <span className="text-base font-normal text-white drop-shadow">
              {symbol}{price.toLocaleString()}/night
            </span>
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────── */}
        <div className="p-3 flex flex-col gap-2 flex-1">
          <h3 className="text-xs font-normal text-slate-900 dark:text-white line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {deal.name}
          </h3>
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{deal.location}</p>
          </div>

          {/* Footer: rating + disclaimer */}
          <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100 dark:border-slate-700/60">
            {deal.rating > 0 ? (
              <div className="flex items-center gap-1.5">
                <span className={`px-1.5 py-0.5 ${getRatingColor(deal.rating)} text-white text-[10px] font-bold rounded`}>
                  {deal.rating.toFixed(1)}
                </span>
                <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300">
                  {getRatingLabel(deal.rating)}
                </span>
              </div>
            ) : <div />}
            <span className="text-[10px] italic text-slate-400">Prices may change</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ── Section ───────────────────────────────────────────────────────────────────
export const LastMinuteWeekendDeals: React.FC<{ deals?: WeekendDeal[] }> = ({ deals }) => {
  const displayDeals = deals || [];
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [activePage, setActivePage] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const scroll = useCallback((dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -540 : 540, behavior: 'smooth' });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setActivePage(maxScroll > 0 && el.scrollLeft / maxScroll >= 0.5 ? 1 : 0);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const goToPage = useCallback((page: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: page === 0 ? 0 : el.scrollWidth - el.clientWidth, behavior: 'smooth' });
    setActivePage(page);
  }, []);

  return (
    <section className="w-full py-2 md:py-4 lg:py-5">
    <section className="w-full py-2 md:py-4 lg:py-5">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium">
                <Sparkles size={12} />
                Hot Deals
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-display font-bold text-slate-900 dark:text-white">
              Flash Getaways
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Limited-time offers on premium stays
            </p>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => {
                setShowAll(v => !v);
                if (!showAll) setTimeout(() => gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
              }}
              className="text-sm text-blue-500 hover:text-blue-600 font-medium mr-1 hidden sm:flex items-center gap-0.5 transition-colors"
            >
              {showAll ? 'Show less ↑' : 'View all →'}
            </button>
            <motion.button
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
              onClick={() => scroll('left')}
              aria-label="Previous deals"
              className="p-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
              onClick={() => scroll('right')}
              aria-label="Next deals"
              className="p-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </motion.button>
          </div>
        </div>

        {/* Carousel */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex overflow-x-auto snap-x snap-mandatory gap-3 pt-5 pb-3 -mt-5"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {displayDeals.map((deal, i) => (
            <FlashGetawayCard key={deal.id} deal={deal} index={i} />
          ))}
        </div>

        {/* Pagination dots */}
        {displayDeals.length > 0 && (
          <div className="flex justify-center items-center gap-2 mt-3">
            {[0, 1].map(page => (
              <button
                key={page}
                onClick={() => goToPage(page)}
                aria-label={`Go to page ${page + 1}`}
                className={`rounded-full transition-all duration-300 ${
                  activePage === page
                    ? 'w-6 h-2 bg-blue-500'
                    : 'w-2 h-2 bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500'
                }`}
              />
            ))}
          </div>
        )}

        {/* "View all" expanded grid */}
        <AnimatePresence>
          {showAll && (
            <motion.div
              ref={gridRef}
              key="flash-deals-grid"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="mt-6"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  All {displayDeals.length} deals
                </p>
                <button
                  onClick={() => setShowAll(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                  Collapse ↑
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {displayDeals.map((deal, i) => (
                  <FlashGetawayCard key={deal.id} deal={deal} index={i} variant="grid" />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {displayDeals.map((deal, i) => (
                  <FlashGetawayCard key={deal.id} deal={deal} index={i} variant="grid" />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};
