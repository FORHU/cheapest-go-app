"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const PLACEHOLDER_PROMPTS = [
    "Find me a beachfront resort in Bali for 2 adults, Feb 14-21...",
    "Luxury hotel in Tokyo under $200/night with pool...",
    "Weekend getaway in Cebu for a couple, next month...",
    "Family resort near Manila, 2 adults 2 kids...",
];

const TYPE_SPEED = 40;
const DELETE_SPEED = 20;
const HOLD_DURATION = 2000;

interface AIPromptInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    disabled?: boolean;
}

const AIPromptInput: React.FC<AIPromptInputProps> = ({ value, onChange, onSubmit, disabled }) => {
    const [displayPlaceholder, setDisplayPlaceholder] = useState('');
    const [promptIndex, setPromptIndex] = useState(0);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const animationRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Typewriter animation for placeholder
    const animatePlaceholder = useCallback(() => {
        const currentPrompt = PLACEHOLDER_PROMPTS[promptIndex];
        let charIndex = 0;
        let isDeleting = false;

        const step = () => {
            if (isDeleting) {
                charIndex--;
                setDisplayPlaceholder(currentPrompt.slice(0, charIndex));
                if (charIndex <= 0) {
                    setPromptIndex((prev) => (prev + 1) % PLACEHOLDER_PROMPTS.length);
                    return;
                }
                animationRef.current = setTimeout(step, DELETE_SPEED);
            } else {
                charIndex++;
                setDisplayPlaceholder(currentPrompt.slice(0, charIndex));
                if (charIndex >= currentPrompt.length) {
                    animationRef.current = setTimeout(() => {
                        isDeleting = true;
                        step();
                    }, HOLD_DURATION);
                    return;
                }
                animationRef.current = setTimeout(step, TYPE_SPEED);
            }
        };

        step();
    }, [promptIndex]);

    useEffect(() => {
        // Only animate when input is empty
        if (value) {
            setDisplayPlaceholder('');
            return;
        }

        animatePlaceholder();

        return () => {
            if (animationRef.current) clearTimeout(animationRef.current);
        };
    }, [promptIndex, value, animatePlaceholder]);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
        }
    }, [value]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (value.trim()) onSubmit();
        }
    };

    return (
        <div className="flex-[4] relative flex items-start gap-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-white/5 px-4 py-3">
            {/* Sparkles Icon */}
            <motion.div
                animate={{ scale: [1, 1.2, 1], rotate: [0, 5, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="mt-0.5 shrink-0"
            >
                <Sparkles
                    size={20}
                    className="text-blue-500 dark:text-cyan-400"
                />
            </motion.div>

            {/* Input Area */}
            <div className="flex-1 relative min-h-[24px]">
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    rows={1}
                    className="w-full bg-transparent text-base font-sans text-slate-900 dark:text-white placeholder-transparent resize-none outline-none disabled:opacity-50 leading-relaxed"
                    style={{ minHeight: '24px', maxHeight: '96px' }}
                />

                {/* Custom animated placeholder */}
                {!value && (
                    <div className="absolute inset-0 pointer-events-none flex items-start">
                        <span className="text-base text-slate-400 dark:text-slate-500 leading-relaxed">
                            {displayPlaceholder}
                            <motion.span
                                animate={{ opacity: [1, 0] }}
                                transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
                                className="inline-block w-0.5 h-5 bg-blue-500 dark:bg-cyan-400 ml-0.5 align-text-bottom"
                            />
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIPromptInput;
