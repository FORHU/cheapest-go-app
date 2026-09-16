'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, ChevronUp, Info } from 'lucide-react';
import {
    suggestionsFor,
    ALWAYS_A_PERSON,
    QUICK_QUESTIONS,
    type SuggestionId,
    type SuggestionOutcome,
} from '@/lib/support/suggestions';

/**
 * The questions the widget answers itself, and the articles it offers while someone types
 * (ADR-0044, amending ADR-0043).
 *
 * An empty chat opens with tappable common questions; tapping one shows that Help Page article
 * as a labelled automated answer in the conversation area, with a way to a person beside it.
 * The text is a person's writing, translated once, and nothing here generates a word — which is
 * the property that lets this exist at all after ADR-0031.
 *
 * What is shown is never stored as a message: a transcript is what the customer and the Agent
 * said to each other, and every row in it must have an author. The inbox learns what was shown
 * from the suggestion events instead.
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
    /** The question the customer tapped, whose answer is on screen now. */
    const [answering, setAnswering] = useState<SuggestionId | null>(null);
    const reported = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!enabled || dismissed || solved || answering) { setArticles([]); return; }

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
    }, [draft, locale, enabled, dismissed, solved, answering]);

    /**
     * The customer wrote to us anyway. The most useful number here: a card with a high rate of
     * this is matching questions it cannot answer, and should be narrowed or dropped.
     */
    const reportSent = useCallback(() => {
        for (const id of reported.current) report(id as SuggestionId, 'sent_anyway', locale);
        reported.current.clear();
        setArticles([]);
        setAnswering(null);
    }, [locale]);

    /** A tapped question. Payment-shaped ones are never answered here — they get a person. */
    const ask = useCallback((id: SuggestionId) => {
        reported.current.add(id);
        report(id, 'shown', locale);
        report(id, 'opened', locale);
        setAnswering(id);
    }, [locale]);

    return {
        articles: solved || answering ? [] : articles,
        answering,
        solved,
        locale,
        /** Chips belong on a chat nobody has written in, and only until one is tapped. */
        showChips: enabled && !dismissed && !solved && !answering && draft.trim().length === 0,
        ask,
        dismiss: () => { setDismissed(true); setAnswering(null); },
        markOpened: (id: SuggestionId) => report(id, 'opened', locale),
        markSolved: (id: SuggestionId) => { report(id, 'solved', locale); setSolved(id); setAnswering(null); },
        reportSent,
    };
}

interface SuggestedAnswersProps {
    articles: SuggestionId[];
    answering: SuggestionId | null;
    solved: SuggestionId | null;
    showChips: boolean;
    onAsk: (id: SuggestionId) => void;
    onOpen: (id: SuggestionId) => void;
    onSolved: (id: SuggestionId) => void;
    onTalkToPerson: (question: string) => void;
    onDismiss: () => void;
}

export function SuggestedAnswers({
    articles,
    answering,
    solved,
    showChips,
    onAsk,
    onOpen,
    onSolved,
    onTalkToPerson,
    onDismiss,
}: SuggestedAnswersProps) {
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

    // ── A tapped question, answered in the conversation area.
    if (answering) {
        return (
            <section aria-label={t('automated')} className="shrink-0 px-4 pb-2">
                <div className="rounded-2xl rounded-bl-md bg-slate-100 px-3.5 py-3 dark:bg-white/5">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                        <Info className="h-3 w-3" /> {t('automated')}
                    </p>
                    <p className="text-[13px] leading-relaxed text-slate-800 dark:text-slate-100">
                        {help(`${answering}.body`)}
                    </p>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => onSolved(answering)}
                        className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                    >
                        {t('solved')}
                    </button>
                    {/*
                      * The way out, always visible. It sends the question as the customer's own
                      * words — true, and better for the Agent than an empty chat (ADR-0044).
                      */}
                    <button
                        type="button"
                        onClick={() => onTalkToPerson(t(`chips.${answering}`))}
                        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                        {t('talkToPerson')}
                    </button>
                </div>
            </section>
        );
    }

    // ── An empty chat: the common questions, one tap each.
    if (showChips) {
        return (
            <section
                aria-label={t('quickHeading')}
                className="shrink-0 border-t border-slate-100 px-4 pb-2 pt-3 dark:border-white/5"
            >
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                    {t('quickHeading')}
                </p>
                <ul className="flex flex-col gap-1">
                    {QUICK_QUESTIONS.map(id => (
                        <li key={id}>
                            <button
                                type="button"
                                onClick={() =>
                                    // A payment problem is a person's job whatever it says on the
                                    // chip: it goes straight to the queue, in the customer's words.
                                    ALWAYS_A_PERSON.includes(id) ? onTalkToPerson(t(`chips.${id}`)) : onAsk(id)
                                }
                                className="group flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-[13px] font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50/70 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-white/10 dark:bg-transparent dark:text-slate-200 dark:hover:border-blue-500/30 dark:hover:bg-white/5 dark:hover:text-white"
                            >
                                <span className="truncate">{t(`chips.${id}`)}</span>
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500 dark:text-slate-600" />
                            </button>
                        </li>
                    ))}
                </ul>
            </section>
        );
    }

    // ── Typing: the articles that match what has been written so far (ADR-0043).
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
