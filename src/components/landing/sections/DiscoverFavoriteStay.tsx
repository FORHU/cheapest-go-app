"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { categories } from '../data';

export const DiscoverFavoriteStay: React.FC = () => {
  return (
    <section className="w-full py-12">
      <div className="max-w-[1400px] mx-auto px-6">
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white mb-6"
        >
          Browse by Category
        </motion.h2>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="group cursor-pointer"
            >
              <div className="relative aspect-3/2 rounded-xl overflow-hidden mb-2">
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                  style={{ backgroundImage: `url(${cat.image})` }}
                />
                <div className="absolute inset-0 bg-linear-to-t from-black/50 to-transparent" />
                <span className="absolute bottom-3 left-3 text-white font-semibold text-sm">
                  {cat.title}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
