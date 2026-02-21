"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { recentSearches } from '@/data';

export const YourRecentSearches: React.FC = () => {
  return (
    <section className="w-full pb-4">
      <div className="w-full max-w-4xl mx-auto px-4 mt-6 sm:mt-8 landscape-compact:mt-2">
        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-base sm:text-lg font-medium text-slate-700 dark:text-slate-300 mb-3"
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
              className="shrink-0 flex items-center gap-2 px-3 py-2 min-h-[60px] bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="w-1 h-7 bg-blue-500 rounded-full flex-shrink-0"></div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 dark:text-white text-xs truncate">{search.destination}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{search.dates}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{search.travelers} • {search.rooms}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
