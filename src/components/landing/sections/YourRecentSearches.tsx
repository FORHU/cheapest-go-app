"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { recentSearches } from '@/data';

export const YourRecentSearches: React.FC = () => {
  return (
    <section className="w-full pb-4">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-[clamp(0.9375rem,2vw,1.125rem)] font-medium text-slate-700 dark:text-slate-300 mb-3"
        >
          Quick Access
        </motion.h3>

        <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
          {recentSearches.map((search, i) => (
            <motion.div
              key={search.id}
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="shrink-0 flex items-center gap-2 sm:gap-3 px-3 py-2.5 sm:px-4 sm:py-3 min-h-[72px] sm:min-h-[80px] bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="w-1 h-8 sm:h-10 bg-blue-500 rounded-full flex-shrink-0"></div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 dark:text-white text-[clamp(0.8125rem,1.5vw,0.875rem)] truncate">{search.destination}</p>
                <p className="text-[clamp(0.6875rem,1.25vw,0.75rem)] text-slate-500 dark:text-slate-400 truncate">{search.dates}</p>
                <p className="text-[clamp(0.6875rem,1.25vw,0.75rem)] text-slate-400 dark:text-slate-500 truncate">{search.travelers} • {search.rooms}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
