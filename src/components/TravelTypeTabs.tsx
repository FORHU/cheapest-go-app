"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plane, Building2, Package, Car } from 'lucide-react';

interface Tab {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const tabs: Tab[] = [
  { id: 'flights', label: 'Flights', icon: <Plane size={18} /> },
  { id: 'stays', label: 'Stays', icon: <Building2 size={18} /> },
  { id: 'packages', label: 'Packages', icon: <Package size={18} /> },
  { id: 'cars', label: 'Cars', icon: <Car size={18} /> },
];

const TravelTypeTabs = () => {
  const [activeTab, setActiveTab] = useState('flights');

  return (
    <div className="flex justify-center mb-8">
      <div className="inline-flex bg-white/5 dark:bg-obsidian-surface backdrop-blur-xl rounded-full p-1.5 border border-alabaster-border dark:border-obsidian-border">
        {tabs.map((tab) => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-colors duration-300 ${
              activeTab === tab.id
                ? 'text-white'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
            whileHover={{ scale: activeTab === tab.id ? 1 : 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTabBg"
                className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-500 dark:from-blue-500 dark:to-cyan-400 rounded-full"
                initial={false}
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {tab.icon}
              {tab.label}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default TravelTypeTabs;
