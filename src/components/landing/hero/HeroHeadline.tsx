"use client";

import React from 'react';
import { motion, Variants } from 'framer-motion';
import { VersionBadge } from '../sections/TelemetryComponents';

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
    },
};

const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
        y: 0,
        opacity: 1,
        transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const },
    },
};

const HeroHeadline: React.FC = () => {
    return (
        <>
            <VersionBadge />

            <motion.div
                variants={containerVariants}
                initial={false}
                animate="visible"
                className="mb-2 sm:mb-4 landscape-compact:mb-0.5"
            >
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-slate-900 dark:text-white tracking-tighter leading-[1.1] mb-1 sm:mb-3 drop-shadow-sm landscape-compact:mb-0.5 landscape-compact:text-3xl">
                    <motion.span variants={itemVariants} className="block">
                        Precision Travel.
                    </motion.span>
                    <motion.span variants={itemVariants} className="block">
                        <span className="text-4xl sm:text-5xl lg:text-6xl text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-400 dark:from-blue-400 dark:to-cyan-300">
                            Machined for You.
                        </span>
                    </motion.span>
                </h1>

                <motion.p
                    variants={itemVariants}
                    className="text-base sm:text-lg md:text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-body leading-relaxed mb-1 sm:mb-2 landscape-compact:hidden"
                >
                    The operating system for the modern voyager.
                </motion.p>

                <motion.p
                    variants={itemVariants}
                    className="text-sm md:text-base max-w-2xl mx-auto font-mono"
                >
                    <span className="text-xs sm:text-sm text-transparent bg-clip-text bg-gradient-to-r from-slate-400 to-slate-500 dark:from-slate-500 dark:to-slate-400">
                        Ask anything. Book everything.
                    </span>
                </motion.p>
            </motion.div>
        </>
    );
};

export default HeroHeadline;
