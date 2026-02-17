"use client";

import React from 'react';
import { motion } from 'framer-motion';

const AITypingIndicator: React.FC = () => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-3 px-4 py-3"
        >
            <div className="flex items-center gap-3 bg-white/40 dark:bg-white/5 backdrop-blur-sm rounded-full px-4 py-2 border border-white/20 dark:border-white/10">
                {/* Bouncing dots */}
                <div className="flex items-center gap-1">
                    {[0, 0.15, 0.3].map((delay, i) => (
                        <motion.div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-cyan-400"
                            animate={{ y: [0, -8, 0] }}
                            transition={{
                                duration: 0.6,
                                repeat: Infinity,
                                delay,
                                ease: 'easeInOut',
                            }}
                        />
                    ))}
                </div>

                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    CheapestGo AI is thinking...
                </span>
            </div>
        </motion.div>
    );
};

export default AITypingIndicator;
