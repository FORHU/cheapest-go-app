"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/utils/cn';

export const ScrollToTop = () => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const toggleVisibility = () => {
            if (window.scrollY > 300) {
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }
        };

        window.addEventListener('scroll', toggleVisibility);
        return () => window.removeEventListener('scroll', toggleVisibility);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth',
        });
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.button
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.2 }}
                    onClick={scrollToTop}
                    className={cn(
                        "fixed z-50 flex items-center justify-center w-8 h-8 lg:w-10 lg:h-10 rounded-full",
                        "bg-blue-600 text-white shadow-lg hover:bg-blue-700 hover:shadow-xl transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
                        // Stacked above the Support Widget launcher, which owns this corner: a
                        // 56px bubble at `sm:bottom-6 right-6`, so its top edge is 80px up. Below
                        // `sm` the launcher drops to `bottom-4` and the mobile nav is the thing to
                        // clear instead — the 80px offset already does.
                        "right-4 sm:right-6 bottom-[calc(env(safe-area-inset-bottom,0px)+80px)] sm:bottom-24"
                    )}
                    aria-label="Scroll to top"
                >
                    <ArrowUp className="w-4 h-4 lg:w-5 lg:h-5" />
                </motion.button>
            )}
        </AnimatePresence>
    );
};
