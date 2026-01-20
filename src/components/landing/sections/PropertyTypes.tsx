"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Building2, Home, Palmtree, Sparkles, ArrowRight } from 'lucide-react';
import { TiltCard } from '../ui/TiltCard';

interface PropertyType {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  count: string;
  gradient: string;
}

const propertyTypes: PropertyType[] = [
  {
    id: 'hotels',
    title: 'Hotels',
    description: 'Luxury to budget-friendly options',
    icon: <Building2 size={28} />,
    count: '2.4M+ properties',
    gradient: 'from-blue-500 to-indigo-600'
  },
  {
    id: 'vacation-rentals',
    title: 'Vacation Rentals',
    description: 'Entire homes & apartments',
    icon: <Home size={28} />,
    count: '1.8M+ properties',
    gradient: 'from-emerald-500 to-teal-600'
  },
  {
    id: 'resorts',
    title: 'Resorts',
    description: 'All-inclusive getaways',
    icon: <Palmtree size={28} />,
    count: '450K+ properties',
    gradient: 'from-amber-500 to-orange-600'
  },
  {
    id: 'unique',
    title: 'Unique Stays',
    description: 'Treehouses, castles & more',
    icon: <Sparkles size={28} />,
    count: '120K+ properties',
    gradient: 'from-purple-500 to-pink-600'
  }
];

const PropertyTypes = () => {
  return (
    <section className="w-full py-16">
      <div className="max-w-[1400px] mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-10"
        >
          <h2 className="text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white mb-2">
            Explore by Property Type
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            Find the perfect accommodation for your next adventure
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {propertyTypes.map((property, i) => (
            <motion.div
              key={property.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <TiltCard>
                <motion.div
                  whileHover={{ y: -5 }}
                  className="relative p-6 bg-white dark:bg-slate-900/80 rounded-xl border border-alabaster-border dark:border-obsidian-border shadow-lg dark:shadow-black/30 cursor-pointer group overflow-hidden"
                >
                  {/* Background Glow */}
                  <div className={`absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br ${property.gradient} opacity-10 blur-3xl rounded-full transition-opacity duration-500 group-hover:opacity-20`} />

                  {/* Icon */}
                  <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${property.gradient} text-white mb-4 shadow-lg`}>
                    {property.icon}
                  </div>

                  {/* Content */}
                  <h3 className="text-lg font-display font-bold text-slate-900 dark:text-white mb-1">
                    {property.title}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                    {property.description}
                  </p>

                  {/* Count & Arrow */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400">
                      {property.count}
                    </span>
                    <motion.div
                      initial={{ x: 0, opacity: 0 }}
                      whileHover={{ x: 5, opacity: 1 }}
                      className="text-obsidian-accent"
                    >
                      <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.div>
                  </div>
                </motion.div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PropertyTypes;
