"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plane } from 'lucide-react';
import { TabList, HorizontalScroll } from '@/components/ui';
import { packages, packageTabs } from '@/data';

export const ExploreVacationPackages: React.FC = () => {
  const [activeTab, setActiveTab] = useState(packageTabs[0]);

  return (
    <section className="w-full py-4 md:py-8 lg:py-10 landscape-compact-py">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-base sm:text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white mb-1"
        >
          All-Inclusive Bundles
        </motion.h2>
        <p className="text-slate-500 dark:text-slate-400 text-[10px] sm:text-sm md:text-base mb-3 sm:mb-4">
          <Plane size={14} className="inline mr-1" />
          Flight + Hotel combos with maximum savings. Free baggage included.
        </p>

        <TabList
          tabs={packageTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          className="mb-4"
        />

        <HorizontalScroll gap={4} scrollAmount={320}>
          {packages.map((pkg, i) => {
            const discount = Math.round((1 - pkg.salePrice / pkg.originalPrice) * 100);
            return (
              <motion.div
                key={pkg.id}
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
                className="flex-shrink-0 w-[220px] sm:w-[260px] md:w-[320px] landscape-compact-card snap-start relative group cursor-pointer flex flex-col"
              >
                {/* Glow effect */}
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-2xl opacity-0 group-hover:opacity-60 blur-xl transition-all duration-500 pointer-events-none" />

                <div className="relative bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50 shadow-lg flex flex-col h-full flex-1">
                  <div className="relative aspect-[2/1] sm:aspect-[4/3] overflow-hidden flex-shrink-0 landscape-compact-img">
                    <motion.div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{ backgroundImage: `url(${pkg.image})` }}
                      whileHover={{ scale: 1.15 }}
                      transition={{ duration: 0.6 }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                    {/* Discount badge */}
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: i * 0.08 + 0.2, type: 'spring' }}
                      className="absolute top-1 left-1 sm:top-2 sm:left-2 px-1.5 py-px sm:px-2.5 sm:py-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-[8px] sm:text-xs font-medium rounded-full shadow-lg"
                    >
                      {discount}% OFF
                    </motion.div>

                    {/* Price tag floating */}
                    <motion.div
                      className="absolute bottom-1 left-1 sm:bottom-3 sm:left-3 px-1 py-px sm:px-3 sm:py-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded sm:rounded-lg shadow-lg"
                      initial={{ y: 10, opacity: 0 }}
                      whileInView={{ y: 0, opacity: 1 }}
                      transition={{ delay: i * 0.08 + 0.2 }}
                    >
                      <span className="text-[8px] sm:text-xs text-slate-400 line-through mr-0.5 sm:mr-1">
                        ₱{pkg.originalPrice.toLocaleString()}
                      </span>
                      <span className="text-[9px] sm:text-sm md:text-base font-bold text-slate-900 dark:text-white">
                        ₱{pkg.salePrice.toLocaleString()}
                      </span>
                    </motion.div>
                  </div>

                  <div className="p-1.5 sm:p-3 md:p-4 landscape-compact-content flex flex-col flex-1">
                    <h3 className="font-semibold text-[11px] sm:text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2 min-h-[2.4em]">
                      {pkg.name}
                    </h3>
                    <p className="text-[9px] sm:text-xs text-slate-500 dark:text-slate-400 flex items-center gap-0.5 sm:gap-1 mt-0.5 line-clamp-1">
                      <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 flex-shrink-0 bg-blue-500 rounded-full animate-pulse" />
                      {pkg.location}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </HorizontalScroll>

        <button className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors">
          See all packages
        </button>
      </div>
    </section>
  );
};
