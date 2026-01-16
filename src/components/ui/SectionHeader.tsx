"use client";

import React from 'react';
import { motion } from 'framer-motion';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  badge?: {
    icon?: React.ReactNode;
    text: string;
  };
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  badge,
  className = '',
  size = 'lg',
}) => {
  const titleSizes = {
    sm: 'text-lg',
    md: 'text-xl md:text-2xl',
    lg: 'text-2xl md:text-3xl',
  };

  return (
    <div className={className}>
      {badge && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="inline-flex items-center gap-2 px-3 py-1.5 mb-3 bg-linear-to-r from-amber-500/10 to-orange-500/10 dark:from-amber-500/20 dark:to-orange-500/20 border border-amber-500/20 rounded-full"
        >
          {badge.icon}
          <span className="text-xs font-mono font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            {badge.text}
          </span>
        </motion.div>
      )}
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: badge ? 0.1 : 0 }}
        className={`${titleSizes[size]} font-display font-bold text-slate-900 dark:text-white ${subtitle ? 'mb-2' : ''}`}
      >
        {title}
      </motion.h2>
      {subtitle && (
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          {subtitle}
        </p>
      )}
    </div>
  );
};
