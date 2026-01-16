"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { recentSearches } from '../data';

export const YourRecentSearches: React.FC = () => {
  return (
    <section className="w-full pb-6">
      <div className="max-w-[1400px] mx-auto px-6">
        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false }}
          className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-4"
        >
          Quick Access
        </motion.h3>
        
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
          {recentSearches.map((search, i) => (
            <motion.div
              key={search.id}
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false }}
              transition={{ delay: i * 0.1 }}
              className="shrink-0 flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="w-1 h-10 bg-blue-500 rounded-full"></div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white text-sm">{search.destination}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{search.dates}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{search.travelers} • {search.rooms}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
