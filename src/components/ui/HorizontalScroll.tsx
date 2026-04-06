"use client";

import React, { useRef, useCallback, useEffect } from 'react';
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

    // Block all user-initiated scrolling — arrows only
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const prevent = (e: Event) => e.preventDefault();

        // Block wheel scroll
        el.addEventListener('wheel', prevent, { passive: false });
        // Block touch swipe
        el.addEventListener('touchmove', prevent, { passive: false });
        // Block trackpad/pointer drag scroll
        el.addEventListener('pointermove', (e: PointerEvent) => {
            if (e.buttons > 0) e.preventDefault();
        }, { passive: false });

        return () => {
            el.removeEventListener('wheel', prevent);
            el.removeEventListener('touchmove', prevent);
        };
    }, []);

    return (
        <div className="relative overflow-x-hidden">
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

            {/* Scroll container — no user scroll, arrows only */}
            <div
                ref={scrollRef}
                className={`flex overflow-x-scroll pt-3 pb-4 snap-x snap-mandatory ${className}`}
                style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    gap: `${gap * 4}px`,
                    userSelect: 'none',
                    WebkitOverflowScrolling: 'auto',
                }}
            >
                {children}
            </div>
        </div>
    );
};
