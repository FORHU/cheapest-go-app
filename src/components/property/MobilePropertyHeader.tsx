"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MobilePropertyHeaderProps {
    propertyName: string;
}

const MobilePropertyHeader: React.FC<MobilePropertyHeaderProps> = ({ propertyName }) => {
    const router = useRouter();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            // Show header after scrolling past the gallery area (~300px)
            setIsVisible(window.scrollY > 300);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div className="lg:hidden fixed top-0 left-0 right-0 z-40 pointer-events-none">
            {/* Scrolling sticky header background with title and share button */}
            <AnimatePresence>
                {isVisible && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.2 }}
                        className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/50 dark:border-white/10 pointer-events-auto shadow-sm"
                    >
                        <div className="flex items-center gap-2 px-3 py-2.5 max-w-7xl mx-auto h-[48px]">
                            {/* Back button in sticky header */}
                            <button
                                onClick={() => router.back()}
                                className="p-2 border border-slate-200/50 dark:border-slate-700/50 bg-white dark:bg-slate-900 rounded-full shadow-sm shrink-0"
                            >
                                <ArrowLeft size={18} className="text-slate-700 dark:text-slate-300" />
                            </button>

                            <div className="flex-1 min-w-0 px-2 flex items-center">
                                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                    {propertyName}
                                </p>
                            </div>

                            <button
                                className="p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-full shadow-sm shrink-0"
                            >
                                <Share2 size={16} className="text-slate-700 dark:text-slate-300" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default MobilePropertyHeader;
