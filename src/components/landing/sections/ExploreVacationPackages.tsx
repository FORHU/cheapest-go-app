"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Plane } from 'lucide-react';
import { TabList, HorizontalScroll } from '@/components/ui';
import { type VacationPackage, packageTabs } from '@/types';
import { convertCurrency, getCurrencySymbol } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';

export const ExploreVacationPackages: React.FC<{
  destinations?: VacationPackage[],
  tabs?: string[]
}> = ({ destinations = [], tabs = packageTabs }) => {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const currency = useUserCurrency();
  const symbol = mounted ? getCurrencySymbol(currency) : getCurrencySymbol('KRW');

  return (
    <section className="w-full py-4 md:py-8 lg:py-10 landscape:py-3 landscape-compact-py">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-base sm:text-2xl md:text-3xl landscape:text-sm font-display font-bold text-slate-900 dark:text-white mb-1"
        >
          All-Inclusive Bundles
        </motion.h2>
        <p className="text-slate-500 dark:text-slate-400 text-[10px] sm:text-sm md:text-base landscape:text-[10px] mb-3 sm:mb-4 landscape:mb-2">
          <Plane size={14} className="inline mr-1" />
          Flight + Hotel combos with maximum savings. Free baggage included.
        </p>

        <TabList
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          className="mb-4 landscape:mb-2"
        />

        <HorizontalScroll gap={4} scrollAmount={320}>
          {destinations.map((pkg: VacationPackage, i: number) => {
            const discount = pkg.originalPrice > 0
              ? Math.round((1 - pkg.salePrice / pkg.originalPrice) * 100)
              : 0;
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
                className="flex-shrink-0 w-[220px] sm:w-[260px] md:w-[320px] landscape:w-[160px] landscape-compact-card snap-start relative group cursor-pointer flex flex-col"
              >
                <div onClick={() => toast.info(pkg.name, { description: 'Live hotel search will be available at launch.' })} className="relative flex flex-col h-full flex-1">
                  <div className="relative bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50 shadow-lg flex flex-col h-full flex-1">
                    <div className="relative aspect-[2/1] sm:aspect-[4/3] md:aspect-[3/2] overflow-hidden flex-shrink-0 landscape-compact-img landscape-img">
                      {pkg.image && (
                        <Image
                          src={pkg.image}
                          alt={pkg.name}
                          fill
                          sizes="(max-width: 640px) 220px, (max-width: 768px) 260px, 320px"
                          className="object-cover transition-transform duration-500 group-hover:scale-110"
                          priority={i === 0}
                          loading={i === 0 ? undefined : 'lazy'}
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                      {/* Discount badge */}
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: i * 0.08 + 0.2, type: 'spring' }}
                        className="absolute top-1 left-1 sm:top-2 sm:left-2 px-1.5 py-px sm:px-2.5 sm:py-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-[8px] sm:text-xs font-medium rounded-full shadow-lg landscape-badge"
                      >
                        {discount}% OFF
                      </motion.div>

                      {/* Price tag floating */}
                      <motion.div
                        className="absolute bottom-1 left-1 sm:bottom-3 sm:left-3 px-1 py-px sm:px-3 sm:py-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded sm:rounded-lg shadow-lg landscape-badge"
                        initial={{ y: 10, opacity: 0 }}
                        whileInView={{ y: 0, opacity: 1 }}
                        transition={{ delay: i * 0.08 + 0.2 }}
                      >
                        <span className="text-[8px] sm:text-xs landscape:text-[8px] text-slate-400 line-through mr-0.5 sm:mr-1">
                          {symbol}{(mounted ? Math.round(convertCurrency(pkg.originalPrice || 0, 'KRW', currency)) : Math.round(pkg.originalPrice || 0)).toLocaleString()}
                        </span>
                        <span className="text-[9px] sm:text-sm md:text-base landscape:text-[9px] font-bold text-slate-900 dark:text-white">
                          {symbol}{(mounted ? Math.round(convertCurrency(pkg.salePrice || 0, 'KRW', currency)) : Math.round(pkg.salePrice || 0)).toLocaleString()}
                        </span>
                      </motion.div>
                    </div>

                    <div className="p-1.5 sm:p-3 md:p-4 landscape:p-1.5 landscape-compact-content flex flex-col flex-1">
                      <h3 className="font-semibold text-[11px] sm:text-sm landscape:text-[10px] text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2 min-h-[2.4em]">
                        {pkg.name}
                      </h3>
                      <p className="text-[9px] sm:text-xs landscape:text-[9px] text-slate-500 dark:text-slate-400 flex items-center gap-0.5 sm:gap-1 mt-0.5 line-clamp-1">
                        <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 flex-shrink-0 bg-blue-500 rounded-full animate-pulse" />
                        {pkg.location}
                      </p>
                      {/* Price disclaimer */}
                      <span className="text-[8px] text-slate-400 italic mt-auto pt-1">Prices may change</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </HorizontalScroll>

        <button className="mt-4 landscape:mt-2 px-4 py-2 landscape:px-3 landscape:py-1.5 text-sm landscape:text-xs font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors">
          See all packages
        </button>
      </div>
    </section>
  );
};
