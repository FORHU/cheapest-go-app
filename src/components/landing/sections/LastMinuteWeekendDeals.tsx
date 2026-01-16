"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useHorizontalScroll } from '@/hooks';
import { ScrollableRow, PropertyCard } from '@/components/ui';
import { weekendDeals } from '../data';

export const LastMinuteWeekendDeals: React.FC = () => {
  const { scrollRef, scrollLeft, scrollRight } = useHorizontalScroll();

  return (
    <section className="w-full py-12">
      <div className="max-w-[1400px] mx-auto px-6">
        <div className="flex items-end justify-between mb-6">
          <div>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false }}
              className="text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white"
            >
              Flash Getaways
            </motion.h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Limited-time offers on premium stays
            </p>
          </div>
        </div>

        <ScrollableRow 
          ref={scrollRef} 
          showNavigation 
          onScrollLeft={scrollLeft} 
          onScrollRight={scrollRight}
        >
          {weekendDeals.map((deal, i) => (
            <div key={deal.id} className="shrink-0 w-[280px]">
              <PropertyCard
                image={deal.image}
                name={deal.name}
                location={deal.location}
                rating={deal.rating}
                reviews={deal.reviews}
                originalPrice={deal.originalPrice}
                price={deal.salePrice}
                badge={deal.badge}
                badgeColor="green"
                index={i}
              />
            </div>
          ))}
        </ScrollableRow>
        
        <button className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 rounded-full hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
          See all deals
        </button>
      </div>
    </section>
  );
};
