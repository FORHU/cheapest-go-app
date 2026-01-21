"use client";

import React from 'react';
import { motion, Variants } from 'framer-motion';
import { SearchModule } from './SearchModule';
import { TiltCard } from '@/components/ui';
import { VersionBadge } from '../sections/TelemetryComponents';

const Hero = () => {
  // Staggered text animation variants
  const containerVariants: Variants = {
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
      transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const }
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
            <SearchModule />
          </TiltCard>
        </motion.div>
      </motion.div>
    </section>
  );
};

export default Hero;

