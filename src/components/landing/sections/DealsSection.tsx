"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Clock, Sparkles } from 'lucide-react';
import { SectionHeader, HorizontalScroll, TiltCard } from '@/components/ui';
import { type Deal } from '@/types';
import { convertCurrency, getCurrencySymbol } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';

/** Converts an ISO timestamp to a human-readable "X ago" string. */
function formatAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface DealCardProps {
  deal: Deal;
  index: number;
}

function handleDealClick(deal: Deal) {
  toast.info(`${deal.title}`, {
    description: 'Live flight search will be available at launch.',
  });
}

export const DealCard: React.FC<DealCardProps> = ({ deal, index }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const currency = useUserCurrency();
  const symbol = getCurrencySymbol(mounted ? currency : 'KRW');
  const original = mounted ? Math.round(convertCurrency(deal.originalPrice || 0, 'KRW', currency)) : Math.round(deal.originalPrice || 0);
  const sale = mounted ? Math.round(convertCurrency(deal.salePrice || 0, 'KRW', currency)) : Math.round(deal.salePrice || 0);

  return (
  <motion.div
    initial={index === 0 ? false : { opacity: 0, x: 50 }}
    whileInView={{ opacity: 1, x: 0 }}
    viewport={{ once: true }}
    transition={{ delay: index * 0.1 }}
    whileHover={{ y: -8 }}
    onClick={() => handleDealClick(deal)}
    className="flex-shrink-0 w-[220px] sm:w-[260px] md:w-[280px] lg:w-[300px] landscape-compact-card snap-start flex flex-col cursor-pointer"
  >
    <TiltCard className="h-full">
        <div className="relative h-full bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50 shadow-lg group">
          {/* Image — responsive height */}
          <div className="relative h-24 sm:h-32 md:h-40 landscape-compact-img landscape-img overflow-hidden flex-shrink-0">
            {deal.image && (
              <Image
                src={deal.image}
                alt={deal.title}
                fill
                sizes="(max-width: 640px) 220px, (max-width: 768px) 260px, 300px"
                className="object-cover transition-transform duration-700 group-hover:scale-110"
                priority={index === 0}
                loading={index === 0 ? undefined : 'lazy'}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

            {/* Discount badge */}
            <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 flex flex-wrap gap-1">
              <div className="px-1.5 py-px sm:px-2.5 sm:py-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-[8px] sm:text-xs font-medium rounded-full shadow-lg">
                {deal.discount}
              </div>
              {deal.tag && (
                <div className="px-1.5 py-px sm:px-2.5 sm:py-1 bg-white/20 backdrop-blur-md text-white text-[8px] sm:text-xs font-medium rounded-full border border-white/20">
                  {deal.tag}
                </div>
              )}
            </div>

            {/* Price tag floating */}
            <div className="absolute bottom-1.5 left-1.5 sm:bottom-3 sm:left-3 px-1.5 py-1 sm:px-3 sm:py-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded sm:rounded-lg shadow-lg">
              <span className="text-[8px] sm:text-xs text-slate-400 line-through mr-1">
                {symbol}{original.toLocaleString()}
              </span>
              <span className="text-[9px] sm:text-sm md:text-base font-bold text-slate-900 dark:text-white">
                {symbol}{sale.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="p-2 sm:p-2.5 landscape-compact-content flex flex-col flex-1">
            <h3 className="text-sm sm:text-base font-display font-bold text-slate-900 dark:text-white mb-0.5 line-clamp-2 leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors min-h-[2em]">
              {deal.title}
            </h3>

            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1 h-1 sm:w-1.2 sm:h-1.2 flex-shrink-0 bg-blue-500 rounded-full animate-pulse" />
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                {deal.subtitle}
              </p>
            </div>

            <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-100 dark:border-white/5">
              <div className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-400">
                <Clock className="w-3 h-3" />
                <span>Ends in {deal.endsIn}</span>
              </div>
              {/* Live price freshness label */}
              <span className="text-[8px] text-slate-400 italic">
                {deal.lastRefreshedAt ? `Updated ${formatAge(deal.lastRefreshedAt)}` : 'Prices may change'}
              </span>
            </div>
          </div>
        </div>
      </TiltCard>
  </motion.div>
  );
};

interface DealsSectionProps {
  deals?: Deal[];
}

const DealsSection: React.FC<DealsSectionProps> = ({ deals }) => {
  const displayDeals = deals || [];

  return (
    <section className="w-full py-4 md:py-8 lg:py-10 landscape-compact-py overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <SectionHeader
          title="Exclusive Deals &amp; Offers"
          badge={{ icon: <Sparkles size={14} />, text: 'Limited Time', variant: 'amber' }}
          actionHref="/deals"
        />

        <HorizontalScroll>
          {displayDeals.map((deal, i) => (
            <DealCard key={deal.id} deal={deal} index={i} />
          ))}
        </HorizontalScroll>
      </div>
    </section>
  );
};

export default DealsSection;
