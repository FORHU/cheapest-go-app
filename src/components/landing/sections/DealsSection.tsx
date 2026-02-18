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
    className="flex-shrink-0 w-[80vw] max-w-[300px] sm:w-[300px] snap-start"
  >
    <TiltCard className="h-full">
      <div className="relative h-full bg-white dark:bg-slate-900/80 rounded-xl overflow-hidden border border-alabaster-border dark:border-obsidian-border shadow-lg dark:shadow-black/30 group">
        {/* Image */}
        <div className="relative h-40 overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
            style={{ backgroundImage: `url(${deal.image})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

          {/* Discount Badge */}
          <div className="absolute top-3 left-3">
            <Badge variant="warning">{deal.discount}</Badge>
          </div>

          {/* Tag */}
          {deal.tag && (
            <div className="absolute top-3 right-3">
              <Badge variant="premium">{deal.tag}</Badge>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="text-lg font-display font-bold text-slate-900 dark:text-white mb-1">
            {deal.title}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            {deal.subtitle}
          </p>

          <div className="flex items-end justify-between">
            <PriceDisplay
              price={deal.salePrice}
              originalPrice={deal.originalPrice}
              currency="$"
            />

            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
              <Clock size={12} className="text-slate-500" />
              <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
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
    <section className="w-full py-10 sm:py-16 overflow-hidden">
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
