"use client";

import React, { useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HorizontalScrollProps {
    children: React.ReactNode;
    showNavigation?: boolean;
    scrollAmount?: number;
    gap?: number;
    className?: string;
}

export const HorizontalScroll: React.FC<HorizontalScrollProps> = ({
    children,
    showNavigation = true,
    scrollAmount = 340,
    gap = 5,
    className = '',
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = useCallback((direction: 'left' | 'right') => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({
                left: direction === 'left' ? -scrollAmount : scrollAmount,
                behavior: 'smooth'
            });
        }
    }, [scrollAmount]);

    return (
        <div className="relative">
            {/* Navigation Arrows */}
            {showNavigation && (
                <div className="hidden md:flex items-center gap-2 absolute -top-14 right-0 z-10">
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => scroll('left')}
                        className="p-2.5 rounded-full bg-white/50 dark:bg-obsidian-surface backdrop-blur-xl border border-alabaster-border dark:border-obsidian-border hover:bg-white dark:hover:bg-white/10 transition-colors"
                    >
                        <ChevronLeft size={20} className="text-slate-600 dark:text-slate-300" />
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => scroll('right')}
                        className="p-2.5 rounded-full bg-white/50 dark:bg-obsidian-surface backdrop-blur-xl border border-alabaster-border dark:border-obsidian-border hover:bg-white dark:hover:bg-white/10 transition-colors"
                    >
                        <ChevronRight size={20} className="text-slate-600 dark:text-slate-300" />
                    </motion.button>
                </div>
            )}

            {/* Scrollable Content */}
            <div
                ref={scrollRef}
                className={`flex overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory ${className}`}
                style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    gap: `${gap * 4}px`
                }}
            >
                {children}
            </div>
        </div>
    );
};
