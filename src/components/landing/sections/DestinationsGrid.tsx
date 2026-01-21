"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Map as MapIcon } from 'lucide-react';
import { TiltCard } from '@/components/ui';
import { DESTINATIONS } from '../../../constants';

const DestinationsGrid = () => {
  return (
    <section className="w-full px-6 max-w-[1400px] mx-auto pb-24">
      <div className="flex items-end justify-between mb-8 px-2">
        <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">Curated Coordinates</h2>
        <a href="#" className="text-sm text-alabaster-accent dark:text-obsidian-accent font-medium flex items-center gap-1 group">
          View Global Map
          <MapIcon size={14} className="group-hover:translate-x-0.5 transition-transform" />
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {DESTINATIONS.map((dest, i) => (
          <motion.div
            key={dest.id}
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className={i === 0 ? "lg:col-span-2 lg:row-span-2" : ""}
          >
            <TiltCard className="h-full">
              <div className={`relative w-full rounded-xl overflow-hidden group shadow-lg dark:shadow-black/50 border border-slate-200/50 dark:border-white/10 ${i === 0 ? 'min-h-[400px] lg:min-h-[500px]' : 'min-h-[200px]'}`}>
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                  style={{ backgroundImage: `url(${dest.image})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent" />

                <div className="absolute bottom-0 left-0 p-6 w-full">
                  {dest.tag && (
                    <div className="inline-block px-2 py-1 mb-3 bg-white/10 backdrop-blur-md border border-white/20 rounded text-[10px] font-mono text-white uppercase tracking-wider">
                      {dest.tag}
                    </div>
                  )}
                  <div className="flex items-end justify-between">
                    <div>
                      <h3 className={`font-display font-bold text-white ${i === 0 ? 'text-3xl' : 'text-lg'}`}>{dest.name}</h3>
                      <p className={`text-slate-300 ${i === 0 ? 'text-sm mt-1' : 'text-xs font-mono mt-1'}`}>
                        {i === 0 ? "Precision skiing conditions. 240cm base depth." : dest.coords}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono text-white font-medium ${i === 0 ? 'text-2xl' : 'text-sm'}`}>${dest.price}</div>
                      {i === 0 && <div className="text-xs text-slate-400 font-mono">AVG ROUND TRIP</div>}
                    </div>
                  </div>
                </div>
              </div>
            </TiltCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default DestinationsGrid;
