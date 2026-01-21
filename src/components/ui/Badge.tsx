"use client";

import React from 'react';
import { motion } from 'framer-motion';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'premium';

interface BadgeProps {
    children: React.ReactNode;
    variant?: BadgeVariant;
    size?: 'sm' | 'md';
    animated?: boolean;
    className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
    default: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    success: 'bg-gradient-to-r from-green-500 to-emerald-600 text-white border-transparent',
    warning: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-transparent',
    danger: 'bg-gradient-to-r from-red-500 to-rose-600 text-white border-transparent',
    info: 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white border-transparent',
    premium: 'bg-white/20 backdrop-blur-md text-white border-white/30',
};

const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
};

export const Badge: React.FC<BadgeProps> = ({
    children,
    variant = 'default',
    size = 'md',
    animated = false,
    className = '',
}) => {
    const Component = animated ? motion.span : 'span';

    return (
        <Component
            className={`inline-flex items-center gap-1 font-medium rounded-full border ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
            {...(animated ? { initial: { scale: 0.8, opacity: 0 }, animate: { scale: 1, opacity: 1 } } : {})}
        >
            {children}
        </Component>
    );
};
