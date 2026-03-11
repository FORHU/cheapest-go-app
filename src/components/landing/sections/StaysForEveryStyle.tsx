"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TabList, GradientBackground, HorizontalScroll } from '@/components/ui';
import { styleTabs } from '@/types';

// Types for travel styles
export interface TravelStyle {
  id: number | string;
  title: string;
  location: string;
  price: number;
  image: string;
}

export const StaysForEveryStyle: React.FC<{ styles?: TravelStyle[] }> = ({ styles }) => {
  const [activeTab, setActiveTab] = useState(styleTabs[0]);
  const displayStyles = styles || [];

  return (
    <GradientBackground className="w-full py-4 md:py-8 lg:py-10 landscape:py-3 landscape-compact-py">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 100 }}
          className="text-base sm:text-2xl md:text-3xl landscape:text-sm font-display font-bold text-slate-900 dark:text-white mb-1 sm:mb-2"
        >
          Curated Collections
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-slate-500 dark:text-slate-400 text-[10px] sm:text-sm md:text-base landscape:text-[10px] mb-2 sm:mb-4 landscape:mb-2"
        >
          Handpicked accommodations for every journey
        </motion.p>

        <TabList
          tabs={styleTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          className="mb-4 sm:mb-6 landscape:mb-2"
        />

        <HorizontalScroll gap={4} scrollAmount={320}>
          {displayStyles.map((style, i) => (
            <motion.div
              key={style.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                delay: i * 0.08,
                type: 'spring',
                stiffness: 100,
                damping: 15
              }}
              whileHover={{ y: -8 }}
              className="flex-shrink-0 w-[220px] sm:w-[260px] md:w-[320px] landscape:w-[160px] landscape-compact-card snap-start relative group cursor-pointer flex flex-col"
            >
              {/* Glow effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-2xl opacity-0 group-hover:opacity-60 blur-xl transition-all duration-500 pointer-events-none" />

              <div className="relative bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50 shadow-lg flex flex-col h-full flex-1">
                <div className="relative aspect-[2/1] sm:aspect-[4/3] md:aspect-[3/2] overflow-hidden flex-shrink-0 landscape-compact-img landscape-img">
                  <motion.div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${style.image})` }}
                    whileHover={{ scale: 1.15 }}
                    transition={{ duration: 0.6 }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                  {/* Price tag floating — responsive */}
                  <motion.div
                    className="absolute bottom-1 left-1 sm:bottom-3 sm:left-3 px-1 py-px sm:px-3 sm:py-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded sm:rounded-lg shadow-lg landscape-badge"
                    initial={{ y: 10, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.08 + 0.2 }}
                  >
                    <span className="text-[9px] sm:text-sm md:text-base landscape:text-[9px] font-bold text-slate-900 dark:text-white">
                      ₱{(style.price || 0).toLocaleString()}
                    </span>
                  </motion.div>
                </div>

                <div className="p-1.5 sm:p-3 md:p-4 landscape:p-1.5 landscape-compact-content flex flex-col flex-1">
                  <h3 className="font-semibold text-[11px] sm:text-sm landscape:text-[10px] text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2 min-h-[2.4em]">
                    {style.title}
                  </h3>
                  <p className="text-[9px] sm:text-xs landscape:text-[9px] text-slate-500 dark:text-slate-400 flex items-center gap-0.5 sm:gap-1 mt-0.5 line-clamp-1">
                    <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 flex-shrink-0 bg-blue-500 rounded-full animate-pulse" />
                    {style.location}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </HorizontalScroll>
      </div>
    </GradientBackground>
  );
};
