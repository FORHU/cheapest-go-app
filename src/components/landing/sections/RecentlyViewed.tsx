"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { History, Clock } from 'lucide-react';
import { SectionHeader, Badge, PriceDisplay } from '@/components/ui';
import { useRecentSearches } from '@/stores';
import { type RecentItem } from '@/types';
import { getCurrencySymbol } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';

interface RecentCardProps {
  item: RecentItem;
  index: number;
}

const RecentCard: React.FC<RecentCardProps> = ({ item, index }) => {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const userCurrency = useUserCurrency();
  const symbol = getCurrencySymbol(mounted ? userCurrency : 'KRW');
  return (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay: index * 0.08 }}
  >
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="flex gap-2 sm:gap-3 p-2.5 sm:p-3 min-h-[88px] sm:min-h-[92px] bg-white dark:bg-slate-900/80 rounded-2xl border border-alabaster-border dark:border-obsidian-border shadow-md dark:shadow-black/20 cursor-pointer group"
    >
      {/* Thumbnail — responsive */}
      <div className="relative w-14 h-14 min-[380px]:w-[4.5rem] min-[380px]:h-[4.5rem] sm:w-20 sm:h-20 rounded-lg overflow-hidden flex-shrink-0">
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
          style={{ backgroundImage: `url(${item.image})` }}
        />
      </div>

      {/* Content — responsive typography */}
      <div className="flex-1 min-w-0">
        <h3 className="text-[clamp(0.75rem,1.5vw,0.875rem)] font-display font-bold text-slate-900 dark:text-white truncate">
          {item.destination}
        </h3>
        <div className="flex items-center gap-1 sm:gap-1.5 mt-0.5 sm:mt-1 text-[clamp(0.625rem,1.25vw,0.75rem)] text-slate-500 dark:text-slate-400">
          <Clock className="w-3 h-3 sm:w-[11px] sm:h-[11px] flex-shrink-0" />
          <span>{item.dates}</span>
        </div>
        <div className="flex items-center justify-between mt-1.5 sm:mt-2 gap-1">
          <Badge variant="default" size="sm">{item.type}</Badge>
          <PriceDisplay price={item.price} currency={symbol} size="sm" />
        </div>
      </div>
    </motion.div>
  </motion.div>
  );
};

const RecentlyViewed = () => {
  // Get recent searches from Zustand store
  const recentSearches = useRecentSearches();

  // Convert Zustand data to display format or use default mock data
  const displayItems: RecentItem[] = recentSearches.length > 0
    ? recentSearches.map((search, index) => ({
      id: String(index),
      destination: search.title,
      dates: 'Recently searched',
      type: search.type === 'airport' ? 'Flight' : 'Stay',
      image: `https://picsum.photos/seed/${search.title.toLowerCase().replace(/\s/g, '')}/200/150`,
      price: 0,
    }))
    : [];

  if (displayItems.length === 0) return null;

  return (
    <section className="w-full pt-6 sm:pt-10 pb-2">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <SectionHeader
          title="Continue Your Search"
          subtitle="Pick up where you left off"
          icon={History}
          actionLabel="View all"
          actionHref="/history"
        />

        {/* Scrollable Container */}
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory hide-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          {displayItems.map((item, i) => (
            <div key={item.id} className="w-[85vw] sm:w-[calc(50%-8px)] lg:w-[calc(25%-12px)] flex-none snap-start">
              <RecentCard item={item} index={i} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default RecentlyViewed;
