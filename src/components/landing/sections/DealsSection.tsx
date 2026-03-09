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
    whileHover={{ y: -8 }}
    className="flex-shrink-0 w-[220px] sm:w-[260px] md:w-[280px] lg:w-[300px] landscape-compact-card snap-start flex flex-col cursor-pointer"
  >
    <TiltCard className="h-full">
      <div className="relative h-full bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50 shadow-lg group">
        {/* Image — responsive height */}
        <div className="relative h-24 sm:h-32 md:h-40 landscape-compact-img landscape-img overflow-hidden flex-shrink-0">
          <motion.div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
            style={{ backgroundImage: `url(${deal.image})` }}
          />
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
              ${deal.originalPrice.toLocaleString()}
            </span>
            <span className="text-[9px] sm:text-sm md:text-base font-bold text-slate-900 dark:text-white">
              ${deal.salePrice.toLocaleString()}
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
          </div>
        </div>
      </div>
    </TiltCard>
  </motion.div>
);

const DealsSection = () => {
  return (
    <section className="w-full py-4 md:py-8 lg:py-10 landscape-compact-py overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <SectionHeader
          title="Exclusive Deals & Offers"
          badge={{ icon: <Sparkles size={14} />, text: 'Limited Time', variant: 'amber' }}
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
