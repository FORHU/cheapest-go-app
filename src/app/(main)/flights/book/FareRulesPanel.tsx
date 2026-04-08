"use client";

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Loader2, AlertTriangle } from 'lucide-react';

interface RuleDetail {
    Category?: string;
    Rules?: string;
    Ruletext?: string;
    FcaDetails?: string;
}

interface FareRule {
    Airline?: string;
    CityPair?: string;
    RuleDetails?: RuleDetail[];
    // flat fields (some Mystifly versions return these directly)
    Category?: string;
    Rules?: string;
    Ruletext?: string;
    FcaDetails?: string;
}

interface FareRulesPanelProps {
    fareSourceCode: string;
}

export function FareRulesPanel({ fareSourceCode }: FareRulesPanelProps) {
    const [fareRules, setFareRules] = useState<FareRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(true);
    const [openCategories, setOpenCategories] = useState<Set<number>>(new Set([0]));

    useEffect(() => {
        if (!fareSourceCode) return;

        fetch('/api/flights/fare-rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fareSourceCode }),
        })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    setFareRules(data.fareRules ?? []);
                } else {
                    const msg = data.error ?? 'Could not load fare rules';
                    console.error('[FareRulesPanel] API error:', msg);
                    setError(msg);
                }
            })
            .catch(err => {
                console.error('[FareRulesPanel] Fetch error:', err);
                setError('Could not load fare rules');
            })
            .finally(() => setLoading(false));
    }, [fareSourceCode]);

    const toggleCategory = (i: number) => {
        setOpenCategories(prev => {
            const next = new Set(prev);
            next.has(i) ? next.delete(i) : next.add(i);
            return next;
        });
    };

    // Don't render if there's nothing to show after loading
    if (!loading && !error && fareRules.length === 0) return null;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 mb-3 lg:mb-6 shadow-sm overflow-hidden">
            {/* Header — always visible */}
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center justify-between px-3 lg:px-5 py-3 lg:py-4 text-left"
            >
                <span className="flex items-center gap-1.5 text-xs lg:text-sm font-semibold text-slate-900 dark:text-white">
                    <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    Fare Rules
                    {!loading && fareRules.length > 0 && (
                        <span className="ml-1.5 text-[10px] lg:text-xs font-normal text-slate-400 dark:text-slate-500">
                            ({fareRules.length} {fareRules.length === 1 ? 'rule' : 'rules'})
                        </span>
                    )}
                </span>
                {loading
                    ? <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin shrink-0" />
                    : expanded
                    ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    : <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                }
            </button>

            {/* Body */}
            {expanded && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-3 lg:px-5 py-3 space-y-2">
                    {error ? (
                        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            {error}
                        </div>
                    ) : fareRules.map((rule, i) => {
                        const groupTitle = [rule.Airline, rule.CityPair].filter(Boolean).join(' · ') || `Route ${i + 1}`;
                        // Normalise: use nested RuleDetails if present, otherwise wrap flat fields
                        const details: RuleDetail[] = rule.RuleDetails?.length
                            ? rule.RuleDetails
                            : [{ Category: rule.Category, Rules: rule.Rules, Ruletext: rule.Ruletext, FcaDetails: rule.FcaDetails }];
                        const isOpen = openCategories.has(i);

                        return (
                            <div key={i} className="rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden">
                                <button
                                    onClick={() => toggleCategory(i)}
                                    className="w-full flex items-center justify-between px-3 py-2 text-left bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                    <span className="text-[11px] lg:text-xs font-medium text-slate-700 dark:text-slate-300 truncate pr-2">
                                        {groupTitle}
                                    </span>
                                    {isOpen
                                        ? <ChevronUp className="w-3 h-3 text-slate-400 shrink-0" />
                                        : <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                                    }
                                </button>
                                {isOpen && (
                                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {details.map((d, j) => {
                                            const text = d.Ruletext || d.Rules || '';
                                            const fcaUrl = d.FcaDetails?.startsWith('http') ? d.FcaDetails : '';
                                            const fcaText = !fcaUrl ? (d.FcaDetails || '') : '';
                                            const body = text || fcaText;
                                            return (
                                                <div key={j} className="px-3 py-2 space-y-1">
                                                    {d.Category && (
                                                        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{d.Category}</p>
                                                    )}
                                                    {fcaUrl && (
                                                        <a href={fcaUrl} target="_blank" rel="noopener noreferrer"
                                                            className="text-[10px] lg:text-xs text-indigo-600 dark:text-indigo-400 underline underline-offset-2 block">
                                                            View fare rules on airline website →
                                                        </a>
                                                    )}
                                                    {body && (
                                                        <p className="text-[10px] lg:text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                                                            {body}
                                                        </p>
                                                    )}
                                                    {!body && !fcaUrl && (
                                                        <p className="text-[10px] lg:text-xs text-slate-400 italic">No rule text provided by airline.</p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
