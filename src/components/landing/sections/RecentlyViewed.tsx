"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { History, Clock } from 'lucide-react';
import { SectionHeader, Badge, PriceDisplay } from '@/components/ui';
import { useRecentSearches } from '@/stores';
import { recentlyViewedItems, type RecentItem } from '@/data';

interface RecentCardProps {
  item: RecentItem;
  index: number;
}

const RecentCard: React.FC<RecentCardProps> = ({ item, index }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: false }}
    transition={{ delay: index * 0.08 }}
  >
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="flex gap-3 p-3 bg-white dark:bg-slate-900/80 rounded-xl border border-alabaster-border dark:border-obsidian-border shadow-md dark:shadow-black/20 cursor-pointer group"
    >
      {/* Thumbnail */}
      <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
          style={{ backgroundImage: `url(${item.image})` }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-display font-bold text-slate-900 dark:text-white truncate">
          {item.destination}
        </h3>
        <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 dark:text-slate-400">
          <Clock size={11} />
          <span>{item.dates}</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <Badge variant="default" size="sm">{item.type}</Badge>
          <PriceDisplay price={item.price} currency="$" size="sm" />
        </div>
      </div>
    </motion.div>
  </motion.div>
);

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
    : recentlyViewedItems;

  if (displayItems.length === 0) return null;

  return (
    <section className="w-full pt-16 pb-4">
      <div className="max-w-[1400px] mx-auto px-6">
        <SectionHeader
          title="Continue Your Search"
          subtitle="Pick up where you left off"
          icon={History}
          actionLabel="View all"
          actionHref="/history"
        />

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {displayItems.slice(0, 4).map((item, i) => (
            <RecentCard key={item.id} item={item} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default RecentlyViewed;
