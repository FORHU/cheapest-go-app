"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { TelemetryCard } from './Components';
import { TELEMETRY_DATA } from '../../../constants';

const Dashboard = () => {
  return (
    <section className="w-full mb-24 px-6 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between mb-8 px-2">
        <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
          Live Telemetry
        </h2>
        <div className="text-xs font-mono text-slate-400">REFRESH RATE: 50MS</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TELEMETRY_DATA.map((data, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
          >
            <TelemetryCard data={data} />
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default Dashboard;
