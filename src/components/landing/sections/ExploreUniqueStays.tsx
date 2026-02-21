"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Star } from 'lucide-react';
import { TabList, SparkleEffect, HorizontalScroll } from '@/components/ui';
import { uniqueStays, uniqueTabs } from '@/data';

export const ExploreUniqueStays: React.FC = () => {
  const [activeTab, setActiveTab] = useState(uniqueTabs[0]);

  return (
    <section className="relative w-full py-6 sm:py-10 overflow-hidden">

      <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex items-center gap-2 mb-1"
        >
          <motion.div
            animate={{ rotate: [0, 15, -15, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Sparkles size={24} className="text-amber-500" />
          </motion.div>
          <h2 className="text-[clamp(1rem,5vw,1.5rem)] font-display font-bold text-slate-900 dark:text-white">
            Extraordinary Escapes
          </h2>
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-slate-500 dark:text-slate-400 text-[clamp(0.75rem,1.5vw,0.875rem)] mb-4"
        >
          One-of-a-kind places from glamping to floating villas
        </motion.p>

        <TabList
          tabs={uniqueTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          className="mb-4"
        />

        <HorizontalScroll gap={4} scrollAmount={320}>
          {uniqueStays.map((stay, i) => (
            <motion.div
              key={stay.id}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{
                delay: i * 0.06,
                type: 'spring',
                stiffness: 100
              }}
              whileHover={{ y: -6, scale: 1.02 }}
              className="flex-shrink-0 w-[48vw] min-w-[200px] max-w-[280px] sm:min-w-[220px] sm:max-w-[320px] snap-start relative group cursor-pointer"
            >
              {/* Glow effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 rounded-2xl opacity-0 group-hover:opacity-70 blur-xl transition-all duration-500 pointer-events-none" />

              <div className="relative bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50 shadow-lg">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <motion.div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${stay.image})` }}
                    whileHover={{ scale: 1.15 }}
                    transition={{ duration: 0.6 }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                  {/* Animated badge */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.06 + 0.2, type: 'spring' }}
                    className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 px-2 py-0.5 sm:px-2.5 sm:py-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-[clamp(0.625rem,1.25vw,0.75rem)] font-medium rounded-full flex items-center gap-1 shadow-lg"
                  >
                    <Star size={10} fill="currentColor" className="animate-pulse flex-shrink-0" />
                    {stay.badge}
                  </motion.div>
                </div>

                <div className="p-2.5 sm:p-3 min-h-[80px] sm:min-h-[88px] flex flex-col">
                  <h3 className="font-semibold text-slate-900 dark:text-white text-[clamp(0.75rem,1.5vw,0.875rem)] truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors min-h-[1.25rem]">
                    {stay.name}
                  </h3>
                  <p className="text-[clamp(0.625rem,1.25vw,0.75rem)] text-slate-500 dark:text-slate-400 mt-0.5 truncate min-h-[1rem]">{stay.location}</p>
                  <p className="text-[clamp(0.75rem,1.5vw,0.875rem)] font-bold mt-auto pt-1 sm:pt-1.5">
                    <span className="bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                      ₱{stay.price.toLocaleString()}
                    </span>
                    <span className="font-normal text-slate-400 text-[clamp(0.625rem,1.25vw,0.75rem)]">/night</span>
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </HorizontalScroll>
      </div>
    </section>
  );
};
