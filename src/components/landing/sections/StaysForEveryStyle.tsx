"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TabList, GradientBackground, HorizontalScroll } from '@/components/ui';

// Travel styles data
const travelStyles = [
  { id: 1, title: 'Beachfront Villa', location: 'Boracay, Philippines', price: 25899, image: 'https://picsum.photos/seed/villa/400/300' },
  { id: 2, title: 'Mountain Retreat', location: 'Batanes, Philippines', price: 18499, image: 'https://picsum.photos/seed/mountain/400/300' },
  { id: 3, title: 'City View Suite', location: 'Makati, Philippines', price: 32450, image: 'https://picsum.photos/seed/city/400/300' },
  { id: 4, title: 'Lux Hotels', location: 'Cebu, Philippines', price: 51709, image: 'https://picsum.photos/seed/luxury/400/300' },
];

const styleTabs = ['Beach', 'Kid-Friendly', 'Ski', 'Romantic', 'Wellness and Relaxation'];

export const StaysForEveryStyle: React.FC = () => {
  const [activeTab, setActiveTab] = useState(styleTabs[0]);

  return (
    <GradientBackground className="w-full py-6 sm:py-10">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 100 }}
          className="text-[clamp(1rem,5vw,1.5rem)] font-display font-bold text-slate-900 dark:text-white mb-1 sm:mb-2"
        >
          Curated Collections
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-slate-500 dark:text-slate-400 text-[clamp(0.75rem,1.5vw,0.875rem)] mb-3 sm:mb-4"
        >
          Handpicked accommodations for every journey
        </motion.p>

        <TabList
          tabs={styleTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          className="mb-4 sm:mb-6"
        />

        <HorizontalScroll gap={4} scrollAmount={320}>
          {travelStyles.map((style, i) => (
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
              className="flex-shrink-0 w-[48vw] min-w-[200px] max-w-[280px] sm:min-w-[220px] sm:max-w-[320px] snap-start relative group cursor-pointer"
            >
              {/* Glow effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-2xl opacity-0 group-hover:opacity-60 blur-xl transition-all duration-500 pointer-events-none" />

              <div className="relative bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50 shadow-lg">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <motion.div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${style.image})` }}
                    whileHover={{ scale: 1.15 }}
                    transition={{ duration: 0.6 }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                  {/* Price tag floating — responsive */}
                  <motion.div
                    className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 px-2 py-1 sm:px-3 sm:py-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-lg shadow-lg"
                    initial={{ y: 10, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.08 + 0.2 }}
                  >
                    <span className="text-[clamp(0.75rem,1.5vw,0.875rem)] font-bold text-slate-900 dark:text-white">
                      ₱{style.price.toLocaleString()}
                    </span>
                  </motion.div>
                </div>

                <div className="p-3 sm:p-4 min-h-[88px] sm:min-h-[96px] flex flex-col">
                  <h3 className="font-semibold text-[clamp(0.8125rem,1.5vw,1rem)] text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2 min-h-[2.5em]">
                    {style.title}
                  </h3>
                  <p className="text-[clamp(0.6875rem,1.25vw,0.875rem)] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 sm:mt-1 line-clamp-1">
                    <span className="w-1.5 h-1.5 flex-shrink-0 bg-blue-500 rounded-full animate-pulse" />
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
