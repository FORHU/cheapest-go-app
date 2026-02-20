"use client";

import React, { useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { TiltCard } from '@/components/ui';
import HeroHeadline from './HeroHeadline';
import AISearchBar from './AISearchBar';
import AISuggestionChips from './AISuggestionChips';

const Hero = () => {
    const suggestionHandlerRef = useRef<((prompt: string) => void) | null>(null);

    const handleSuggestionReady = useCallback((handler: (prompt: string) => void) => {
        suggestionHandlerRef.current = handler;
    }, []);

    const handleChipClick = useCallback((prompt: string) => {
        suggestionHandlerRef.current?.(prompt);
    }, []);

    return (
        <section className="w-full flex flex-col items-center text-center max-w-4xl mx-auto mt-10 sm:mt-16 md:mt-20 mb-10 sm:mb-16 md:mb-20 relative px-4">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[600px] h-[200px] sm:h-[300px] bg-alabaster-accent/5 dark:bg-obsidian-accent/10 blur-[100px] rounded-full pointer-events-none z-[-1]" />

            {/* Headline */}
            <HeroHeadline />

            {/* AI Search Bar — floating with bobbing animation */}
            <motion.div
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 100, damping: 20, delay: 0.8 }}
                className="w-full relative z-10"
            >
                <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                >
                    <TiltCard className="w-full">
                        <AISearchBar onSuggestionReady={handleSuggestionReady} />
                    </TiltCard>
                </motion.div>
            </motion.div>

            {/* Suggestion Chips — below the floating search bar */}
            <AISuggestionChips onSuggestionClick={handleChipClick} />
        </section>
    );
};

export default Hero;
