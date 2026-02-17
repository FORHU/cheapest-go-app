"use client";

import React, { useState, useCallback, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { MagneticButton } from '@/components/ui';
import SearchModeToggle from './SearchModeToggle';
import AIPromptInput from './AIPromptInput';
import AITypingIndicator from './AITypingIndicator';
import AIResultsPreview from './AIResultsPreview';
import { SearchModule } from './SearchModule';
import { useSearchModule } from '@/hooks';

type SearchMode = 'classic' | 'ai';

// Mock AI parse results — visual prototype only
const DEFAULT_RESULT = {
    destination: 'Boracay, Philippines',
    dates: 'Feb 14 — Feb 21',
    guests: '2 Adults',
    budget: 'Under ₱12,000/night',
};

function parseMockResult(query: string) {
    const lower = query.toLowerCase();
    const result = { ...DEFAULT_RESULT };

    if (lower.includes('bali')) result.destination = 'Bali, Indonesia';
    else if (lower.includes('tokyo')) result.destination = 'Tokyo, Japan';
    else if (lower.includes('cebu')) result.destination = 'Cebu, Philippines';
    else if (lower.includes('manila')) result.destination = 'Manila, Philippines';
    else if (lower.includes('tagaytay')) result.destination = 'Tagaytay, Philippines';
    else if (lower.includes('baguio')) result.destination = 'Baguio, Philippines';

    if (lower.includes('family') || lower.includes('kids') || lower.includes('children'))
        result.guests = '2 Adults, 2 Children';
    else if (lower.includes('group') || lower.includes('4'))
        result.guests = '4 Adults';
    else if (lower.includes('couple'))
        result.guests = '2 Adults';

    if (lower.includes('luxury') || lower.includes('5-star'))
        result.budget = 'Under ₱25,000/night';
    else if (lower.includes('$200'))
        result.budget = 'Under $200/night';
    else if (lower.includes('₱15,000') || lower.includes('15000'))
        result.budget = 'Under ₱15,000/night';

    if (lower.includes('weekend'))
        result.dates = 'This Weekend';
    else if (lower.includes('next month'))
        result.dates = 'Next Month';
    else if (lower.includes('3 nights'))
        result.dates = '3 Nights';

    return result;
}

interface AISearchBarProps {
    onSuggestionReady?: (handler: (prompt: string) => void) => void;
}

const AISearchBarContent: React.FC<AISearchBarProps> = ({ onSuggestionReady }) => {
    const [mode, setMode] = useState<SearchMode>('classic');
    const [aiQuery, setAiQuery] = useState('');
    const [isAIThinking, setIsAIThinking] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [parsedResult, setParsedResult] = useState(DEFAULT_RESULT);

    const { handleSearch } = useSearchModule();

    const handleModeChange = useCallback((newMode: SearchMode) => {
        setMode(newMode);
        setShowResults(false);
        setIsAIThinking(false);
    }, []);

    const triggerAI = useCallback((query: string) => {
        setIsAIThinking(true);
        setShowResults(false);
        setTimeout(() => {
            setParsedResult(parseMockResult(query));
            setIsAIThinking(false);
            setShowResults(true);
        }, 2000);
    }, []);

    const handleAISubmit = useCallback(() => {
        if (!aiQuery.trim() || isAIThinking) return;
        triggerAI(aiQuery);
    }, [aiQuery, isAIThinking, triggerAI]);

    const handleSuggestionClick = useCallback((prompt: string) => {
        setMode('ai');
        setAiQuery(prompt);
        triggerAI(prompt);
    }, [triggerAI]);

    // Expose suggestion handler to parent
    React.useEffect(() => {
        onSuggestionReady?.(handleSuggestionClick);
    }, [onSuggestionReady, handleSuggestionClick]);

    return (
        <div className="w-full">
            <SearchModeToggle mode={mode} onModeChange={handleModeChange} />

            {/* Shared Animated Glow Border — wraps both modes */}
            <div className="relative">
                <motion.div
                    className={`absolute -inset-[1px] pointer-events-none z-0 ${mode === 'classic' ? 'rounded-xl' : 'rounded-2xl'}`}
                    style={{
                        background: 'linear-gradient(135deg, rgba(37,99,235,0.5), rgba(34,211,238,0.5), rgba(139,92,246,0.3), rgba(34,211,238,0.5), rgba(37,99,235,0.5))',
                        backgroundSize: '300% 300%',
                    }}
                    animate={{
                        opacity: [0.4, 0.8, 0.4],
                        backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                    }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                />

                <AnimatePresence mode="wait">
                    {mode === 'classic' ? (
                        /* Classic Mode — SearchModule with transparent border so glow shows */
                        <motion.div
                            key="classic"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            className="relative z-10"
                        >
                            <SearchModule />
                        </motion.div>
                    ) : (
                        /* AI Mode — custom glass card */
                        <motion.div
                            key="ai"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            className="relative z-10"
                        >
                            {/* Card Body */}
                            <div className="bg-white/60 dark:bg-[#0f172a]/80 backdrop-blur-3xl rounded-2xl shadow-2xl dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] border border-transparent p-2 sm:p-3">
                                {/* Input Row */}
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <AIPromptInput
                                        value={aiQuery}
                                        onChange={setAiQuery}
                                        onSubmit={handleAISubmit}
                                        disabled={isAIThinking}
                                    />
                                    <MagneticButton
                                        onClick={handleAISubmit}
                                        isLoading={isAIThinking}
                                        label="Ask AI"
                                        icon={<Sparkles size={16} />}
                                    />
                                </div>

                                {/* Typing Indicator */}
                                <AnimatePresence>
                                    {isAIThinking && <AITypingIndicator />}
                                </AnimatePresence>

                                {/* Results Preview */}
                                <AnimatePresence>
                                    {showResults && !isAIThinking && (
                                        <AIResultsPreview
                                            result={parsedResult}
                                            onSearch={handleSearch}
                                        />
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

// Main export with Suspense wrapper
const AISearchBar: React.FC<AISearchBarProps> = (props) => {
    return (
        <Suspense fallback={
            <div className="w-full">
                <div className="flex justify-center mb-4">
                    <div className="h-10 w-48 bg-white/10 rounded-full animate-pulse" />
                </div>
                <div className="bg-white/60 dark:bg-[#0f172a]/80 backdrop-blur-3xl rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 p-3 h-[72px] animate-pulse" />
            </div>
        }>
            <AISearchBarContent {...props} />
        </Suspense>
    );
};

export default AISearchBar;
