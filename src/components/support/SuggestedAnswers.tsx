'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
    suggestionsFor,
    type SuggestionId,
    type SuggestionOutcome,
} from '@/lib/support/suggestions';

/**
 * Help Page articles offered while the customer types (ADR-0043).
 *
 * An offer, never a reply: these sit below the transcript and above the composer, attributed to
 * nobody, and nothing here is written into the chat. Only a person answers inside a Support
 * Chat (ADR-0031) — the difference is not how good the text is, it is whether someone chose to
 * send it into *this* conversation.
 *
 * Sending is never blocked, delayed or discouraged. A customer who ignores these gets exactly
 * the service they got before they existed.
 */

/** Long enough that the customer has stopped typing a thought, short enough to feel immediate. */
const DEBOUNCE_MS = 400;

/** Tell the server what happened to a card. A counter: it must never delay or interrupt anyone. */
function report(articleId: SuggestionId, outcome: SuggestionOutcome, locale: string) {
    void fetch('/api/support/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, outcome, locale }),
        keepalive: true,
    }).catch(() => {
        // Nothing to do and nothing to say: the customer is asking a question, not filing a
        // report, and a failed counter is our problem.
    });
}

export function useSuggestedAnswers(draft: string, enabled: boolean) {
    const locale = useLocale();
    const [articles, setArticles] = useState<SuggestionId[]>([]);
    const [dismissed, setDismissed] = useState(false);
    const [solved, setSolved] = useState<SuggestionId | null>(null);
    const reported = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!enabled || dismissed || solved) { setArticles([]); return; }

        const timer = setTimeout(() => {
            const next = suggestionsFor(draft, locale);
            setArticles(next);
            for (const id of next) {
                if (reported.current.has(id)) continue;
                reported.current.add(id);
                report(id, 'shown', locale);
            }
        }, DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [draft, locale, enabled, dismissed, solved]);

    /**
     * The customer wrote to us anyway. The most useful number here: a card with a high rate of
     * this is matching questions it cannot answer, and should be narrowed or dropped.
     */
    const reportSent = useCallback(() => {
        for (const id of reported.current) report(id as SuggestionId, 'sent_anyway', locale);
        reported.current.clear();
        setArticles([]);
    }, [locale]);

    return {
        articles: solved ? [] : articles,
        solved,
        locale,
        dismiss: () => setDismissed(true),
        markOpened: (id: SuggestionId) => report(id, 'opened', locale),
        markSolved: (id: SuggestionId) => { report(id, 'solved', locale); setSolved(id); },
        reportSent,
    };
}

interface SuggestedAnswersProps {
    articles: SuggestionId[];
    solved: SuggestionId | null;
    onOpen: (id: SuggestionId) => void;
    onSolved: (id: SuggestionId) => void;
    onDismiss: () => void;
}

export function SuggestedAnswers({ articles, solved, onOpen, onSolved, onDismiss }: SuggestedAnswersProps) {
    const t = useTranslations('support.suggestions');
    const help = useTranslations('help.sections');
    const [open, setOpen] = useState<SuggestionId | null>(null);

    if (solved) {
        return (
            <p className="shrink-0 px-4 pb-2 text-xs text-emerald-700 dark:text-emerald-400">
                {t('solvedNote')}
            </p>
        );
    }

    if (articles.length === 0) return null;

    return (
        <section aria-label={t('heading')} className="shrink-0 px-4 pb-2">
            <p className="mb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('heading')}</p>

            <ul className="flex flex-col gap-1.5">
                {articles.map(id => {
                    const expanded = open === id;
                    return (
                        <li key={id} className="rounded-lg border border-slate-200 dark:border-white/10">
                            <button
                                type="button"
                                aria-expanded={expanded}
                                onClick={() => {
                                    setOpen(expanded ? null : id);
                                    if (!expanded) onOpen(id);
                                }}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-slate-800 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:text-slate-100 dark:hover:bg-white/5"
                            >
                                <span>{help(`${id}.title`)}</span>
                                {expanded
                                    ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                    : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                            </button>

                            {expanded && (
                                <div className="border-t border-slate-100 px-3 py-2 dark:border-white/5">
                                    <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                                        {help(`${id}.body`)}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            onClick={() => onSolved(id)}
                                            className="text-xs font-semibold text-emerald-700 underline-offset-2 transition hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-emerald-400"
                                        >
                                            {t('solved')}
                                        </button>
                                        {/*
                                          * Not a refusal to help: it puts the cards away and
                                          * leaves the customer where they were, mid-message.
                                          */}
                                        <button
                                            type="button"
                                            onClick={onDismiss}
                                            className="text-xs font-medium text-slate-500 underline-offset-2 transition hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400"
                                        >
                                            {t('stillNeedHelp')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
