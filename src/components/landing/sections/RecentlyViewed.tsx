"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { History, Clock, ArrowRight } from 'lucide-react';

interface RecentItem {
  id: string;
  destination: string;
  dates: string;
  type: string;
  image: string;
  price: number;
}

const recentItems: RecentItem[] = [
  {
    id: '1',
    destination: 'New York, USA',
    dates: 'Dec 15 - Dec 22',
    type: 'Flights + Hotel',
    image: 'https://picsum.photos/seed/nyc/200/150',
    price: 1249
  },
  {
    id: '2',
    destination: 'London, UK',
    dates: 'Jan 5 - Jan 12',
    type: 'Flights',
    image: 'https://picsum.photos/seed/london/200/150',
    price: 899
  },
  {
    id: '3',
    destination: 'Singapore',
    dates: 'Feb 20 - Feb 27',
    type: 'Hotel',
    image: 'https://picsum.photos/seed/singapore/200/150',
    price: 1650
  },
  {
    id: '4',
    destination: 'Sydney, Australia',
    dates: 'Mar 1 - Mar 10',
    type: 'Flights + Hotel',
    image: 'https://picsum.photos/seed/sydney/200/150',
    price: 2100
  }
];

const RecentlyViewed = () => {
  return (
    <section className="w-full pt-16 pb-4">
      <div className="max-w-[1400px] mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <History size={20} className="text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                Continue Your Search
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Pick up where you left off
              </p>
            </div>
          </div>

          <motion.a
            whileHover={{ x: 5 }}
            href="#"
            className="hidden md:flex items-center gap-1 text-sm font-medium text-obsidian-accent group"
          >
            View all
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </motion.a>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {recentItems.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false }}
              transition={{ delay: i * 0.08 }}
            >
              <motion.div
                whileHover={{ scale: 1.02, y: -2 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="flex gap-3 p-3 bg-white dark:bg-slate-900/80 rounded-xl border border-alabaster-border dark:border-obsidian-border shadow-md dark:shadow-black/20 cursor-pointer group"
              >
                {/* Thumbnail */}
                <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                    style={{ backgroundImage: `url(${item.image})` }}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-display font-bold text-slate-900 dark:text-white truncate">
                    {item.destination}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 dark:text-slate-400">
                    <Clock size={11} />
                    <span>{item.dates}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-600 dark:text-slate-400">
                      {item.type}
                    </span>
                    <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                      ${item.price}
                    </span>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default RecentlyViewed;
