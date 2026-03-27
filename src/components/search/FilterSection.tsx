"use client";

import React from 'react';
import { motion } from 'framer-motion';

interface FilterSectionProps {
    title: string;
    children: React.ReactNode;
    index?: number;
}

export const FilterSection = ({ title, children, index = 0 }: FilterSectionProps) => (
    <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.05, duration: 0.4 }}
        className="border-b border-slate-200 dark:border-white/5 py-4 last:border-0"
    >
        <h4 className="font-semibold text-sm text-slate-900 dark:text-white mb-3">{title}</h4>
        <div className="space-y-2">
            {children}
        </div>
    </motion.div>
);
