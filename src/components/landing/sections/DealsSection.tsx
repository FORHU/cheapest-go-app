"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Sparkles } from 'lucide-react';
import { SectionHeader, HorizontalScroll, Badge, PriceDisplay, TiltCard } from '@/components/ui';
import { flashDeals, type Deal } from '@/data';

interface DealCardProps {
  deal: Deal;
  index: number;
}

const DealCard: React.FC<DealCardProps> = ({ deal, index }) => (
  <motion.div
    initial={{ opacity: 0, x: 50 }}
    whileInView={{ opacity: 1, x: 0 }}
    viewport={{ once: true }}
    transition={{ delay: index * 0.1 }}
    className="flex-shrink-0 w-[48vw] min-w-[180px] max-w-[280px] sm:min-w-[220px] sm:max-w-[320px] snap-start"
  >
    <TiltCard className="h-full">
      <div className="relative h-full bg-white dark:bg-slate-900/80 rounded-xl overflow-hidden border border-alabaster-border dark:border-obsidian-border shadow-lg dark:shadow-black/30 group">
        {/* Image — responsive height */}
        <div className="relative h-28 min-[400px]:h-32 sm:h-36 md:h-40 overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
            style={{ backgroundImage: `url(${deal.image})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

          {/* Badges — responsive size, avoid overlap on narrow cards */}
          <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 min-[400px]:top-2.5 min-[400px]:left-2.5 md:top-3 md:left-3 flex flex-wrap gap-1 max-w-[calc(100%-3rem)]">
            <Badge variant="warning" size="sm">{deal.discount}</Badge>
            {deal.tag && (
              <Badge variant="premium" size="sm">{deal.tag}</Badge>
            )}
          </div>
        </div>

        {/* Content — fixed min-height so all cards same size */}
        <div className="p-3 sm:p-4 min-h-[120px] sm:min-h-[128px] flex flex-col">
          <h3 className="text-[clamp(0.875rem,2vw,1.125rem)] font-display font-bold text-slate-900 dark:text-white mb-0.5 sm:mb-1 line-clamp-2 min-h-[2.5em]">
            {deal.title}
          </h3>
          <p className="text-[clamp(0.6875rem,1.5vw,0.875rem)] text-slate-500 dark:text-slate-400 mb-2 sm:mb-3 line-clamp-1 flex-1">
            {deal.subtitle}
          </p>

          <div className="flex items-end justify-between gap-2 mt-auto">
            <PriceDisplay
              price={deal.salePrice}
              originalPrice={deal.originalPrice}
              currency="$"
            />

            <div className="flex items-center gap-1 sm:gap-1.5 px-1.5 py-0.5 sm:px-2 sm:py-1 bg-slate-100 dark:bg-slate-800 rounded-full flex-shrink-0">
              <Clock className="w-3 h-3 sm:w-[12px] sm:h-[12px] text-slate-500" />
              <span className="text-[10px] sm:text-xs font-mono text-slate-600 dark:text-slate-400">
                {deal.endsIn}
              </span>
            </div>
          </div>
        </div>
      </div>
    </TiltCard>
  </motion.div>
);

const DealsSection = () => {
  return (
    <section className="w-full py-6 sm:py-10 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <SectionHeader
          title="Exclusive Deals & Offers"
          badge={{ icon: <Sparkles size={14} />, text: 'Limited Time', variant: 'amber' }}
          actionLabel="View all deals"
          actionHref="/deals"
        />

        <HorizontalScroll>
          {flashDeals.map((deal, i) => (
            <DealCard key={deal.id} deal={deal} index={i} />
          ))}
        </HorizontalScroll>
      </div>
    </section>
  );
};

export default DealsSection;
