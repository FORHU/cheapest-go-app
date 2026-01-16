"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plane } from 'lucide-react';
import { TabList, PropertyCard } from '@/components/ui';
import { packages, packageTabs } from '../data';

export const ExploreVacationPackages: React.FC = () => {
  const [activeTab, setActiveTab] = useState(packageTabs[0]);

  return (
    <section className="w-full py-12">
      <div className="max-w-[1400px] mx-auto px-6">
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false }}
          className="text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white mb-2"
        >
          All-Inclusive Bundles
        </motion.h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
          <Plane size={14} className="inline mr-1" />
          Flight + Hotel combos with maximum savings. Free baggage included.
        </p>

        <TabList 
          tabs={packageTabs} 
          activeTab={activeTab} 
          onTabChange={setActiveTab}
          className="mb-6"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {packages.map((pkg, i) => (
            <PropertyCard
              key={pkg.id}
              image={pkg.image}
              name={pkg.name}
              location={pkg.location}
              rating={pkg.rating}
              reviews={pkg.reviews}
              originalPrice={pkg.originalPrice}
              price={pkg.salePrice}
              includes={pkg.includes}
              index={i}
            />
          ))}
        </div>

        <button className="mt-6 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors">
          See all packages
        </button>
      </div>
    </section>
  );
};
