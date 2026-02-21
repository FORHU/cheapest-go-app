"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plane } from 'lucide-react';
import { TabList, HorizontalScroll } from '@/components/ui';
import { PropertyCard } from '@/components/shared';
import { packages, packageTabs } from '@/data';

export const ExploreVacationPackages: React.FC = () => {
  const [activeTab, setActiveTab] = useState(packageTabs[0]);

  return (
    <section className="w-full py-6 sm:py-10">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-[clamp(1rem,5vw,1.5rem)] font-display font-bold text-slate-900 dark:text-white mb-1"
        >
          All-Inclusive Bundles
        </motion.h2>
        <p className="text-slate-500 dark:text-slate-400 text-[clamp(0.75rem,1.5vw,0.875rem)] mb-4">
          <Plane size={14} className="inline mr-1" />
          Flight + Hotel combos with maximum savings. Free baggage included.
        </p>

        <TabList
          tabs={packageTabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          className="mb-4"
        />

        <HorizontalScroll gap={4} scrollAmount={320}>
          {packages.map((pkg, i) => (
            <div
              key={pkg.id}
              className="flex-shrink-0 w-[48vw] min-w-[200px] max-w-[280px] sm:min-w-[220px] sm:max-w-[320px] snap-start"
            >
              <PropertyCard
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
            </div>
          ))}
        </HorizontalScroll>

        <button className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors">
          See all packages
        </button>
      </div>
    </section>
  );
};
