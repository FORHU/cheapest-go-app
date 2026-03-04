"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Search, FileText, CheckCircle2, ArrowRight } from 'lucide-react';

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
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-[2.5rem] p-8 shadow-xl flex flex-col h-full overflow-hidden relative"
        >
            <div className="flex items-center justify-between mb-10 relative z-10">
                <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Booking Funnel</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Conversion Efficiency</p>
                </div>
                <div className="px-3 py-1 bg-emerald-500/10 rounded-lg">
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">
                        {((data.confirmed / data.searches) * 100).toFixed(1)}% Conversion
                    </span>
                </div>
            </div>

            <div className="flex-1 flex flex-col justify-center space-y-8 relative z-10">
                {steps.map((step, i) => {
                    const percentage = (step.value / maxVal) * 100;
                    const nextStep = steps[i + 1];
                    const dropRate = nextStep ? (1 - nextStep.value / step.value) * 100 : 0;

                    return (
                        <div key={step.label} className="relative">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-xl ${step.color}/10 ${step.color.replace('bg-', 'text-')}`}>
                                        <step.icon size={16} />
                                    </div>
                                    <span className="text-sm font-black text-slate-700 dark:text-slate-200">{step.label}</span>
                                </div>
                                <span className="text-sm font-black text-slate-900 dark:text-white">{step.value.toLocaleString()}</span>
                            </div>

                            <div className="h-4 bg-slate-50 dark:bg-white/5 rounded-full overflow-hidden relative">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${percentage}%` }}
                                    transition={{ duration: 1, delay: i * 0.2, ease: "easeOut" }}
                                    className={`h-full ${step.color} rounded-full shadow-lg shadow-${step.color.split('-')[1]}-500/20`}
                                />
                            </div>

                            {nextStep && (
                                <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                                    <ArrowRight size={10} className="rotate-90" />
                                    <span>{dropRate.toFixed(0)}% Drop-off</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Background Decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full pointer-events-none" />
        </motion.div>
    );
}
