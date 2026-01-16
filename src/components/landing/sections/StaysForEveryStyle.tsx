"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TabList, GradientBackground } from '@/components/ui';
import { travelStyles, styleTabs } from '../data';

export const StaysForEveryStyle: React.FC = () => {
  const [activeTab, setActiveTab] = useState(styleTabs[0]);

  return (
    <GradientBackground className="w-full py-16">
      <div className="max-w-[1400px] mx-auto px-6">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false }}
          transition={{ type: 'spring', stiffness: 100 }}
          className="text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white mb-2"
        >
          Curated Collections
        </motion.h2>
        <motion.p 
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false }}
          transition={{ delay: 0.1 }}
          className="text-slate-500 dark:text-slate-400 text-sm mb-6"
        >
          Handpicked accommodations for every journey
        </motion.p>

        <TabList 
          tabs={styleTabs} 
          activeTab={activeTab} 
          onTabChange={setActiveTab}
          className="mb-8"
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {travelStyles.map((style, i) => (
            <motion.div
              key={style.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false }}
              transition={{ 
                delay: i * 0.1,
                type: 'spring',
                stiffness: 100,
                damping: 15
              }}
              whileHover={{ y: -10 }}
              className="relative group cursor-pointer"
            >
              {/* Glow effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-2xl opacity-0 group-hover:opacity-60 blur-xl transition-all duration-500" />
              
              <div className="relative bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50 shadow-lg">
                <div className="relative aspect-4/3 overflow-hidden">
                  <motion.div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${style.image})` }}
                    whileHover={{ scale: 1.15 }}
                    transition={{ duration: 0.6 }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  
                  {/* Price tag floating */}
                  <motion.div 
                    className="absolute bottom-3 left-3 px-3 py-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm rounded-lg shadow-lg"
                    initial={{ y: 10, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    transition={{ delay: i * 0.1 + 0.3 }}
                  >
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      ₱{style.price.toLocaleString()}
                    </span>
                  </motion.div>
                </div>
                
                <div className="p-4">
                  <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {style.title}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1">
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                    {style.location}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </GradientBackground>
  );
};
