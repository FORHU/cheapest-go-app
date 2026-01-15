"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Smartphone, Star, Download, ChevronRight } from 'lucide-react';

const AppBanner = () => {
  return (
    <section className="w-full py-16">
      <div className="max-w-[1400px] mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-8 md:p-12"
        >
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
            }} />
          </div>

          {/* Floating Orbs */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/4 w-48 h-48 bg-cyan-400/20 rounded-full blur-3xl" />

          <div className="relative flex flex-col md:flex-row items-center gap-8">
            {/* Phone Mockup */}
            <motion.div
              initial={{ x: -50, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="relative flex-shrink-0"
            >
              <div className="relative w-40 h-72 bg-slate-900 rounded-[2rem] p-2 shadow-2xl border border-white/20">
                <div className="w-full h-full bg-gradient-to-b from-slate-800 to-slate-900 rounded-[1.5rem] overflow-hidden">
                  {/* App Screen Content */}
                  <div className="p-3">
                    <div className="w-full h-16 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-lg mb-2" />
                    <div className="space-y-2">
                      <div className="h-3 bg-white/20 rounded w-3/4" />
                      <div className="h-3 bg-white/10 rounded w-1/2" />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="h-16 bg-white/10 rounded-lg" />
                      <div className="h-16 bg-white/10 rounded-lg" />
                    </div>
                  </div>
                </div>
                {/* Notch */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-16 h-4 bg-black rounded-full" />
              </div>
              
              {/* Floating Badge */}
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-4 -right-4 px-3 py-1.5 bg-white rounded-full shadow-lg flex items-center gap-1"
              >
                <Star size={14} className="text-amber-500 fill-amber-500" />
                <span className="text-sm font-bold text-slate-900">4.9</span>
              </motion.div>
            </motion.div>

            {/* Content */}
            <div className="flex-1 text-center md:text-left">
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full mb-4">
                  <Smartphone size={14} className="text-white" />
                  <span className="text-xs font-medium text-white">Mobile App</span>
                </div>
                
                <h3 className="text-2xl md:text-3xl font-display font-bold text-white mb-3">
                  Travel smarter with our app
                </h3>
                <p className="text-white/80 mb-6 max-w-md">
                  Get exclusive app-only deals, instant notifications, and manage your trips on the go.
                </p>

                {/* Stats */}
                <div className="flex flex-wrap justify-center md:justify-start gap-6 mb-6">
                  <div>
                    <div className="text-2xl font-mono font-bold text-white">10M+</div>
                    <div className="text-xs text-white/60">Downloads</div>
                  </div>
                  <div>
                    <div className="text-2xl font-mono font-bold text-white">4.9</div>
                    <div className="text-xs text-white/60">App Rating</div>
                  </div>
                  <div>
                    <div className="text-2xl font-mono font-bold text-white">15%</div>
                    <div className="text-xs text-white/60">Extra Savings</div>
                  </div>
                </div>

                {/* Download Buttons */}
                <div className="flex flex-wrap justify-center md:justify-start gap-3">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-900 rounded-xl font-medium shadow-lg"
                  >
                    <Download size={18} />
                    Download App
                    <ChevronRight size={16} />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white/20 text-white rounded-xl font-medium border border-white/30 backdrop-blur-sm"
                  >
                    Learn More
                  </motion.button>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default AppBanner;
