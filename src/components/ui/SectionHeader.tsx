"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, LucideIcon } from 'lucide-react';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  badge?: {
    icon?: React.ReactNode;
    text: string;
    variant?: 'default' | 'amber' | 'blue' | 'green';
  };
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const badgeVariants = {
  default: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  amber: 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 dark:from-amber-500/20 dark:to-orange-500/20 text-amber-600 dark:text-amber-400 border-amber-500/20',
  blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800',
};

const titleSizes = {
  sm: 'text-[clamp(0.9375rem,2vw,1.125rem)]',
  md: 'text-[clamp(1.0625rem,2.5vw,1.5rem)]',
  lg: 'text-[clamp(1.125rem,4vw,1.875rem)]',
};

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  badge,
  actionLabel,
  actionHref,
  onAction,
  className = '',
  size = 'sm',
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={`flex items-end justify-between mb-4 sm:mb-5 ${className}`}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg mt-1">
            <Icon size={20} className="text-slate-600 dark:text-slate-400" />
          </div>
        )}
        <div>
          {badge && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className={`inline-flex items-center gap-2 px-3 py-1.5 mb-3 border rounded-full ${badgeVariants[badge.variant || 'amber']}`}
            >
              {badge.icon}
              <span className="text-xs font-mono font-medium uppercase tracking-wider">
                {badge.text}
              </span>
            </motion.div>
          )}
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: badge ? 0.1 : 0 }}
            className={`${titleSizes[size]} font-display font-bold text-slate-900 dark:text-white`}
          >
            {title}
          </motion.h2>
          {subtitle && (
            <p className="text-[clamp(0.6875rem,1.5vw,0.875rem)] text-slate-500 dark:text-slate-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {(actionLabel || onAction) && (
        <motion.a
          whileHover={{ x: 5 }}
          href={actionHref || '#'}
          onClick={(e) => {
            if (onAction) {
              e.preventDefault();
              onAction();
            }
          }}
          className="hidden md:flex items-center gap-1 text-sm font-medium text-alabaster-accent dark:text-obsidian-accent group"
        >
          {actionLabel || 'View all'}
          <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
        </motion.a>
      )}
    </motion.div>
  );
};

