"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, CheckCircle2, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';

interface ConversionFunnelProps {
    data: {
        searches: number;
        quotes: number;
        confirmed: number;
    };
}

export function ConversionFunnel({ data }: ConversionFunnelProps) {
    const steps = [
        { label: 'Searches', value: data.searches, icon: Search, color: 'bg-blue-500' },
        { label: 'Quotes', value: data.quotes, icon: FileText, color: 'bg-indigo-500' },
        { label: 'Confirmed', value: data.confirmed, icon: CheckCircle2, color: 'bg-emerald-500' },
    ];

    const maxVal = Math.max(data.searches, 1);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col overflow-hidden relative group transition-all duration-500"
        >
            <div className="flex items-center justify-between mb-4 relative z-10">
                <div className="flex-1">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white transition-colors">Booking Funnel</h3>
                        </div>
                    </div>
                </div>

            </div>

            <div className="flex-1 relative z-10">
                <div className="flex-1 flex flex-col justify-center space-y-4">
                    {steps.map((step, i) => (
                        <div key={step.label} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-xl ${step.color}/10 ${step.color.replace('bg-', 'text-')} transition-colors`}>
                                    <step.icon size={16} />
                                </div>
                                <span className="text-sm font-black text-slate-900 dark:text-white transition-colors">{step.label}</span>
                            </div>
                            <span suppressHydrationWarning className="text-sm font-black text-slate-900 dark:text-white transition-colors">{step.value.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Background Decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full pointer-events-none transition-colors" />
        </motion.div>
    );
}
