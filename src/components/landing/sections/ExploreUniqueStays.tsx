"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Star } from 'lucide-react';
import { TabList, SparkleEffect } from '@/components/ui';
import { uniqueStays, uniqueTabs } from '@/data';

export const ExploreUniqueStays: React.FC = () => {
  const [activeTab, setActiveTab] = useState(uniqueTabs[0]);

  return (
    <section className="relative w-full py-16 overflow-hidden">
      {/* Background sparkle effect */}
      <SparkleEffect count={30} className="opacity-30 dark:opacity-50" />

      <div className="relative max-w-[1400px] mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex items-center gap-2 mb-2"
        >
          <motion.div
            animate={{ rotate: [0, 15, -15, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Sparkles size={24} className="text-amber-500" />
          </motion.div>
          <h2 className="text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white">
            Extraordinary Escapes
          </h2>
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-slate-500 dark:text-slate-400 text-sm mb-8"
        >
          One-of-a-kind places from glamping to floating villas
        </motion.p>

        <TabList
          tabs={uniqueTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          className="mb-8"
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-5">
          {uniqueStays.map((stay, i) => (
            <motion.div
              key={stay.id}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true }}
              transition={{
                delay: i * 0.08,
                type: 'spring',
                stiffness: 100
              }}
              whileHover={{ y: -8, scale: 1.03 }}
              className="relative group cursor-pointer"
            >
              {/* Glow effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 rounded-2xl opacity-0 group-hover:opacity-70 blur-xl transition-all duration-500" />

              <div className="relative bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50 shadow-lg">
                <div className="relative aspect-4/3 overflow-hidden">
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
                    transition={{ delay: i * 0.08 + 0.3, type: 'spring' }}
                    className="absolute top-2 left-2 px-2.5 py-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs font-medium rounded-full flex items-center gap-1 shadow-lg"
                  >
                    <Star size={10} fill="currentColor" className="animate-pulse" />
                    {stay.badge}
                  </motion.div>
                </div>

                <div className="p-3">
                  <h3 className="font-semibold text-slate-900 dark:text-white text-sm truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {stay.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stay.location}</p>
                  <p className="text-sm font-bold mt-1.5">
                    <span className="bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                      ₱{stay.price.toLocaleString()}
                    </span>
                    <span className="font-normal text-slate-400 text-xs">/night</span>
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
