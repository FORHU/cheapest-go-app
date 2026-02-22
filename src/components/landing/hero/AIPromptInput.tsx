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
        <div className="relative flex items-end gap-2 bg-transparent px-3 py-2 sm:py-3 w-full">
            {/* Input Area */}
            <div className="flex-1 relative min-h-[28px] pt-1 flex items-center">
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    rows={1}
                    className="w-full bg-transparent text-sm sm:text-[15px] font-medium font-sans text-slate-800 dark:text-slate-100 placeholder-transparent resize-none outline-none disabled:opacity-50 leading-relaxed pr-8"
                    style={{ minHeight: '28px', maxHeight: '100px' }}
                />

                {/* Custom animated placeholder */}
                {!value && (
                    <div className="absolute inset-0 pointer-events-none flex items-center pl-1">
                        <span className="text-sm sm:text-[15px] font-medium text-slate-500/80 dark:text-slate-400/80 leading-relaxed">
                            {displayPlaceholder}
                            <motion.span
                                animate={{ opacity: [1, 0] }}
                                transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
                                className="inline-block w-[1.5px] h-[16px] bg-slate-400 dark:bg-slate-500 ml-1 sm:h-[18px] align-middle"
                            />
                        </span>
                    </div>
                )}
            </div>

            {/* Inline Submit Button */}
            <button
                onClick={onSubmit}
                disabled={disabled || !value.trim()}
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${value.trim() && !disabled
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                    }`}
            >
                {disabled ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                )}
            </button>
        </div>
    );
};

export default AIPromptInput;
