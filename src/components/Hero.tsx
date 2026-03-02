"use client";

import React from 'react';
import { motion, Variants } from 'framer-motion';
import { PlaneTakeoff, Calendar, User, Search } from 'lucide-react';
import { TiltCard } from './ui/TiltCard';
import { VersionBadge } from './landing/sections/TelemetryComponents';

const Hero = () => {
  // Staggered text animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3
      }
    }
  };

  const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] }
    }
  };

  return (
    <section className="w-full flex flex-col items-center text-center max-w-4xl mx-auto mt-20 mb-20 relative px-4">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-alabaster-accent/5 dark:bg-obsidian-accent/10 blur-[100px] rounded-full pointer-events-none z-[-1]" />

      <VersionBadge />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="mb-8"
      >
        <h1 className="text-5xl md:text-7xl font-display font-bold text-slate-900 dark:text-white tracking-tighter leading-[1.1] mb-6 drop-shadow-sm">
          <motion.span variants={itemVariants} className="block">Precision Travel.</motion.span>
          <motion.span variants={itemVariants} className="block">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-400 dark:from-blue-400 dark:to-cyan-300">Machined for You.</span>
          </motion.span>
        </h1>

        <motion.p variants={itemVariants} className="text-lg md:text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-body leading-relaxed mb-2">
          The operating system for the modern voyager.
        </motion.p>
        <motion.p variants={itemVariants} className="text-sm md:text-base text-slate-400 dark:text-slate-500 max-w-2xl mx-auto font-mono">
          Real-time telemetry, zero-latency booking, obsidian-grade security.
        </motion.p>
      </motion.div>

      {/* Floating Search Module */}
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.8 }}
        className="w-full relative z-10"
      >
        {/* Weightless Bobbing Animation Wrapper */}
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <TiltCard className="w-full">
            <div className="relative bg-white/60 dark:bg-[#0f172a]/80 backdrop-blur-3xl rounded-xl shadow-2xl dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] border border-white/20 dark:border-white/10 p-2 flex flex-col md:flex-row gap-2">

              {/* Inputs Container */}
              <div className="flex-1 flex flex-col sm:flex-row bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-white/5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-white/5">
                <div className="flex-1 relative flex items-center px-4 h-16 group">
                  <PlaneTakeoff className="text-slate-400 group-focus-within:text-alabaster-accent dark:group-focus-within:text-obsidian-accent transition-colors" />
                  <div className="ml-3 flex flex-col justify-center w-full text-left">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-medium tracking-wider">Origin</label>
                    <input className="bg-transparent border-none p-0 h-6 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-0 text-sm font-medium w-full font-body outline-none" type="text" defaultValue="New York (JFK)" />
                  </div>
                </div>
                <div className="flex-1 relative flex items-center px-4 h-16 group">
                  <div className="ml-3 flex flex-col justify-center w-full text-left">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-medium tracking-wider">Destination</label>
                    <input className="bg-transparent border-none p-0 h-6 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-0 text-sm font-medium w-full font-body outline-none" placeholder="City or Airport" type="text" />
                  </div>
                </div>
              </div>

              <div className="flex-1 flex flex-col sm:flex-row bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-white/5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-white/5">
                <div className="flex-[1.5] relative flex items-center px-4 h-16 group">
                  <Calendar className="text-slate-400 group-focus-within:text-alabaster-accent dark:group-focus-within:text-obsidian-accent transition-colors" />
                  <div className="ml-3 flex flex-col justify-center w-full text-left">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-medium tracking-wider">Dates</label>
                    <input className="bg-transparent border-none p-0 h-6 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-0 text-sm font-medium w-full font-body outline-none" type="text" defaultValue="Oct 24 - Nov 02" />
                  </div>
                </div>
                <div className="flex-1 relative flex items-center px-4 h-16 group">
                  <User className="text-slate-400 group-focus-within:text-alabaster-accent dark:group-focus-within:text-obsidian-accent transition-colors" />
                  <div className="ml-3 flex flex-col justify-center w-full text-left">
                    <label className="text-[10px] uppercase font-mono text-slate-500 font-medium tracking-wider">Travelers</label>
                    <select className="bg-transparent border-none p-0 h-6 text-slate-900 dark:text-white focus:ring-0 text-sm font-medium w-full font-body outline-none cursor-pointer">
                      <option>1 Passenger</option>
                      <option>2 Passengers</option>
                    </select>
                  </div>
                </div>
              </div>

              <button className="h-16 px-8 bg-blue-600 hover:bg-blue-700 text-white font-medium sm:rounded-r-lg sm:rounded-bl-none rounded-b-lg md:ml-2 transition-colors flex items-center justify-center gap-2">
                <Search className="w-5 h-5" />
                <span className="hidden sm:inline md:hidden lg:inline">Search</span>
              </button>
            </div>
          </TiltCard>
        </motion.div>
      </motion.div>
    </section>
  );
};

export default Hero;
