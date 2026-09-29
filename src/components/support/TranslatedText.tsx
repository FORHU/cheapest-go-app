'use client';

import { useState } from 'react';
import { Languages, Loader2, AlertTriangle } from 'lucide-react';
import type { ReaderView } from './translationView';

/**
 * A message body, and — when it is a machine translation — the fact that it is one.
 *
 * Every translation is marked as machine-made, to the Agent and to the customer alike
 * (CONTEXT.md, "Translation"). Stored, a translation looks exactly like authored text, and
 * the label is the only thing stopping a customer reading a mistranslated policy as
 * CheapestGo's considered wording — or an Agent answering a sentence the customer never
 * wrote.
 *
 * Labels are passed in rather than read from a locale file, because this renders in two
 * places with different languages: the customer's widget (localised) and the Agent's inbox
 * (English, which is the staff working language).
 */
export interface TranslatedTextLabels {
    translated: string;
    showOriginal: string;
    showTranslation: string;
    pending: string;
    untranslated: string;
}

export function TranslatedText({
    view,
    labels,
    className,
    tone = 'light',
}: {
    view: ReaderView;
    labels: TranslatedTextLabels;
    className?: string;
    /** 'dark' on the customer's own blue bubble, so the marker stays legible. */
    tone?: 'light' | 'dark';
}) {
    const [showingOriginal, setShowingOriginal] = useState(false);
    const text = showingOriginal && view.original ? view.original : view.primary;

    const meta = tone === 'dark'
        ? 'text-blue-100/80'
        : 'text-slate-400 dark:text-slate-500';

    return (
        <>
            <span className={className}>{text}</span>

            {view.label && (
                <span className={`mt-1 flex flex-wrap items-center gap-1.5 text-[10px] ${meta}`}>
                    {view.label === 'pending' && (
                        <>
                            <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
                            {labels.pending}
                        </>
                    )}

                    {/*
                      * The one state that must not be quiet. For an Agent it means the words
                      * above are the customer's own, in their language, because translating
                      * them failed — usually because the translator refused a distressed
                      * message. Amber so it is read, not skimmed.
                      */}
                    {view.label === 'untranslated' && (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                            {labels.untranslated}
                        </span>
                    )}

                    {view.label === 'translated' && (
                        <>
                            <Languages className="h-2.5 w-2.5" aria-hidden />
                            {labels.translated}
                            {view.original && (
                                <>
                                    <span aria-hidden>·</span>
                                    <button
                                        type="button"
                                        onClick={() => setShowingOriginal(v => !v)}
                                        className="underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-1 focus-visible:ring-current"
                                    >
                                        {showingOriginal ? labels.showTranslation : labels.showOriginal}
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </span>
            )}
        </>
    );
}
