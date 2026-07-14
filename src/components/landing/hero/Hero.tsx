"use client";

import React, { useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TiltCard } from '@/components/ui';
import HeroHeadline from './HeroHeadline';
import AISearchBar from './AISearchBar';
import AISuggestionChips from './AISuggestionChips';
import { useSearchMode } from '@/stores/searchStore';

const Hero = () => {
    const suggestionHandlerRef = useRef<((prompt: string) => void) | null>(null);
    const searchMode = useSearchMode();

    const handleSuggestionReady = useCallback((handler: (prompt: string) => void) => {
        suggestionHandlerRef.current = handler;
    }, []);

    const handleChipClick = useCallback((prompt: string) => {
        suggestionHandlerRef.current?.(prompt);
    }, []);

    return (
        <section className="w-full flex flex-col items-center text-center max-w-4xl mx-auto mt-6 md:mt-10 lg:mt-16 mb-6 md:mb-10 lg:mb-16 landscape-compact:mt-2 landscape-compact:mb-2 relative z-30">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[600px] h-[200px] sm:h-[300px] bg-alabaster-accent/5 dark:bg-obsidian-accent/10 blur-3xl rounded-full pointer-events-none z-[-1]" />

            {/* Headline */}
            <div className="px-4 w-full flex flex-col items-center">
                <HeroHeadline />
            </div>

            {/* AI Search Bar */}
            <div className="w-full relative z-10 px-4">
                <TiltCard className="w-full">
                    <AISearchBar onSuggestionReady={handleSuggestionReady} />
                </TiltCard>
            </div>

            {/* Suggestion Chips — only visible when AI search tab is active */}
            <AnimatePresence>
                {searchMode === 'ai' && (
                    <motion.div
                        key="suggestion-chips"
                        initial={{ opacity: 0, y: -8, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -8, height: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden w-full"
                    >
                        <AISuggestionChips onSuggestionClick={handleChipClick} />
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
};

export default Hero;
