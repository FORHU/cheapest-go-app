"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Palmtree, Gem, Heart, Plane, Mountain } from 'lucide-react';

interface Suggestion {
    icon: React.ReactNode;
    label: string;
    prompt: string;
}

const suggestions: Suggestion[] = [
    { icon: <Palmtree size={12} />, label: 'Beach Escape', prompt: 'Beachfront resort in Boracay for 2, this weekend' },
    { icon: <Gem size={12} />, label: 'Luxury Stay', prompt: '5-star hotel in Manila under ₱15,000/night' },
    { icon: <Heart size={12} />, label: 'Romantic Trip', prompt: "Couple's retreat in Tagaytay with spa" },
    { icon: <Plane size={12} />, label: 'Quick Getaway', prompt: 'Last-minute deal in Cebu, 3 nights' },
    { icon: <Mountain size={12} />, label: 'Adventure', prompt: 'Mountain lodge in Baguio for a group of 4' },
];

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.08,
            delayChildren: 0.6,
        },
    },
};

const chipVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const },
    },
};

interface AISuggestionChipsProps {
    onSuggestionClick: (prompt: string) => void;
}

const AISuggestionChips: React.FC<AISuggestionChipsProps> = ({ onSuggestionClick }) => {
    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="mt-3 md:mt-5 flex flex-wrap justify-center gap-2 pb-2 md:pb-0 px-4 md:px-0"
        >
            {suggestions.map((suggestion) => (
                <motion.button
                    key={suggestion.label}
                    variants={chipVariants}
                    onClick={() => onSuggestionClick(suggestion.prompt)}
                    whileHover={{ scale: 1.04, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    className="flex items-center gap-1 md:gap-2 px-2 py-1 md:px-4 md:py-2 rounded-full shrink-0 text-[10px] sm:text-xs font-medium transition-colors duration-200 cursor-pointer
                        bg-white/50 dark:bg-white/5 backdrop-blur-sm
                        border border-slate-200 dark:border-white/10
                        text-slate-600 dark:text-slate-300
                        hover:bg-white/80 dark:hover:bg-white/10
                        hover:border-blue-300 dark:hover:border-cyan-500/30
                        hover:text-blue-600 dark:hover:text-cyan-300
                        hover:shadow-[0_0_15px_rgba(37,99,235,0.15)] dark:hover:shadow-[0_0_15px_rgba(34,211,238,0.1)]"
                >
                    <span className="text-slate-400 dark:text-slate-500 group-hover:text-blue-500">
                        {suggestion.icon}
                    </span>
                    {suggestion.label}
                </motion.button>
            ))}
        </motion.div>
    );
};

export default AISuggestionChips;
