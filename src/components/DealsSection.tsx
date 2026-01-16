"use client";

import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Clock, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { TiltCard } from './TiltCard';

interface Deal {
  id: string;
  title: string;
  subtitle: string;
  discount: string;
  originalPrice: number;
  salePrice: number;
  image: string;
  endsIn: string;
  tag?: string;
}

const deals: Deal[] = [
  {
    id: '1',
    title: 'Tokyo Adventure',
    subtitle: 'Round trip + 5 nights',
    discount: '35% OFF',
    originalPrice: 2499,
    salePrice: 1624,
    image: 'https://picsum.photos/seed/tokyo/400/300',
    endsIn: '2d 14h',
    tag: 'Flash Sale'
  },
  {
    id: '2',
    title: 'Paris Getaway',
    subtitle: 'Round trip + 4 nights',
    discount: '25% OFF',
    originalPrice: 1899,
    salePrice: 1424,
    image: 'https://picsum.photos/seed/paris/400/300',
    endsIn: '1d 8h'
  },
  {
    id: '3',
    title: 'Bali Paradise',
    subtitle: 'Round trip + 7 nights',
    discount: '40% OFF',
    originalPrice: 2199,
    salePrice: 1319,
    image: 'https://picsum.photos/seed/bali/400/300',
    endsIn: '3d 2h',
    tag: 'Best Value'
  },
  {
    id: '4',
    title: 'Swiss Alps Escape',
    subtitle: 'Round trip + 5 nights',
    discount: '30% OFF',
    originalPrice: 3299,
    salePrice: 2309,
    image: 'https://picsum.photos/seed/swiss/400/300',
    endsIn: '4d 6h'
  },
  {
    id: '5',
    title: 'Dubai Luxury',
    subtitle: 'Round trip + 4 nights',
    discount: '20% OFF',
    originalPrice: 2799,
    salePrice: 2239,
    image: 'https://picsum.photos/seed/dubai/400/300',
    endsIn: '5d 12h',
    tag: 'Premium'
  }
];

const DealsSection = () => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 340;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <section className="w-full py-16 overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false }}
              className="inline-flex items-center gap-2 px-3 py-1.5 mb-3 bg-gradient-to-r from-amber-500/10 to-orange-500/10 dark:from-amber-500/20 dark:to-orange-500/20 border border-amber-500/20 rounded-full"
            >
              <Sparkles size={14} className="text-amber-500" />
              <span className="text-xs font-mono font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">Limited Time</span>
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false }}
              transition={{ delay: 0.1 }}
              className="text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white"
            >
              Exclusive Deals & Offers
            </motion.h2>
          </div>
          
          {/* Navigation Arrows */}
          <div className="hidden md:flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => scroll('left')}
              className="p-2.5 rounded-full bg-white/50 dark:bg-obsidian-surface backdrop-blur-xl border border-alabaster-border dark:border-obsidian-border hover:bg-white dark:hover:bg-white/10 transition-colors"
            >
              <ChevronLeft size={20} className="text-slate-600 dark:text-slate-300" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => scroll('right')}
              className="p-2.5 rounded-full bg-white/50 dark:bg-obsidian-surface backdrop-blur-xl border border-alabaster-border dark:border-obsidian-border hover:bg-white dark:hover:bg-white/10 transition-colors"
            >
              <ChevronRight size={20} className="text-slate-600 dark:text-slate-300" />
            </motion.button>
          </div>
        </div>

        {/* Scrollable Cards */}
        <div
          ref={scrollRef}
          className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {deals.map((deal, i) => (
            <motion.div
              key={deal.id}
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false }}
              transition={{ delay: i * 0.1 }}
              className="flex-shrink-0 w-[300px] snap-start"
            >
              <TiltCard className="h-full">
                <div className="relative h-full bg-white dark:bg-slate-900/80 rounded-xl overflow-hidden border border-alabaster-border dark:border-obsidian-border shadow-lg dark:shadow-black/30 group">
                  {/* Image */}
                  <div className="relative h-40 overflow-hidden">
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                      style={{ backgroundImage: `url(${deal.image})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    
                    {/* Discount Badge */}
                    <div className="absolute top-3 left-3 px-2.5 py-1 bg-gradient-to-r from-red-500 to-orange-500 rounded-full">
                      <span className="text-xs font-mono font-bold text-white">{deal.discount}</span>
                    </div>
                    
                    {/* Tag */}
                    {deal.tag && (
                      <div className="absolute top-3 right-3 px-2.5 py-1 bg-white/20 backdrop-blur-md rounded-full border border-white/30">
                        <span className="text-xs font-medium text-white">{deal.tag}</span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    <h3 className="text-lg font-display font-bold text-slate-900 dark:text-white mb-1">{deal.title}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{deal.subtitle}</p>
                    
                    <div className="flex items-end justify-between">
                      <div>
                        <span className="text-sm text-slate-400 line-through">${deal.originalPrice}</span>
                        <div className="text-xl font-mono font-bold text-slate-900 dark:text-white">${deal.salePrice}</div>
                      </div>
                      
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                        <Clock size={12} className="text-slate-500" />
                        <span className="text-xs font-mono text-slate-600 dark:text-slate-400">{deal.endsIn}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default DealsSection;
