"use client";

import React, { useId } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * The one frame every booking in the list is drawn in: hotel, flight and golf.
 *
 * What should be identical is here, so it cannot drift again: the shape, the type chip, the status
 * vocabulary, the facts row, how money is set, and where the actions sit. A card supplies only
 * what is its own: the lead block, the words, the facts, the amount and the actions.
 *
 * Colour is the system's and it means something. Route Blue is the one primary action, focus and
 * the date of a booking that is still ahead; tinted semantic pills are status; slate is everything
 * that is inert. A booking's type is told by an icon and a label, never by a hue of its own.
 *
 * Actions come in three tiers so the card says what matters: one primary (see the booking), a few
 * boxed secondaries (change or cancel it), and quiet links for the rest (receipt, map, the airline).
 * They sit in one footer row, so a card stays as short as what it says.
 */

export type StatusTone = 'emerald' | 'amber' | 'rose' | 'slate' | 'blue';

const TONE: Record<StatusTone, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
    slate: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
};

export function StatusChip({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
    return (
        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border chip-text px-2.5 py-0.5 font-semibold ${TONE[tone]}`}>
            {children}
        </span>
    );
}

export interface CardFact {
    icon?: LucideIcon;
    label: string;
    /** Dates, times, references and counts are set in the numeric face. */
    mono?: boolean;
}

/**
 * A leading currency symbol and the figure after it, or null when there is no symbol up front
 * ("5.200,00 €" is left whole rather than guessed at).
 */
export function splitCurrency(text: string): { symbol: string; figure: string } | null {
    const match = /^(\D+?)\s*(\d.*)$/.exec(text);
    if (!match || match[1].trim() === '') return null;
    return { symbol: match[1].trim(), figure: match[2] };
}

function Amount({ text, muted }: { text: string; muted?: boolean }) {
    const parts = splitCurrency(text);
    return (
        <p className={`font-mono text-lg font-bold tabular-nums ${muted
            ? 'text-slate-400 line-through dark:text-slate-500'
            : 'text-slate-900 dark:text-white'}`}>
            {parts ? (
                <>
                    {/* The symbol sits smaller than the figure, as the design system sets prices. */}
                    <span className="mr-0.5 text-sm font-medium">{parts.symbol}</span>
                    {parts.figure}
                </>
            ) : text}
        </p>
    );
}

export interface BookingCardShellProps {
    /** The leading block: a photograph, or a DateBlock. */
    lead: React.ReactNode;
    typeIcon: LucideIcon;
    typeLabel: string;
    status: { tone: StatusTone; label: string };
    /** A status that says more than a label (a sub-note, a pulse). Replaces `status` when given. */
    statusNode?: React.ReactNode;
    title: string;
    subtitle?: string;
    facts?: CardFact[];
    /** Rendered under the facts: policy pills, notes. */
    footnote?: React.ReactNode;
    money?: { amount: string; caption?: string; /** Never taken: shown struck through and quiet. */ muted?: boolean };
    /** The one primary action. */
    primary?: React.ReactNode;
    /** Secondary actions, as boxed buttons: the ones that change the booking. */
    actions?: React.ReactNode;
    /** Tertiary actions, as quiet links: receipt, map, supplier detail. */
    links?: React.ReactNode;
    /** For the part of the card that can open it (an expandable itinerary). */
    children?: React.ReactNode;
}

export function BookingCardShell({
    lead, typeIcon: TypeIcon, typeLabel, status, statusNode, title, subtitle, facts = [], footnote,
    money, primary, actions, links, children,
}: BookingCardShellProps) {
    const titleId = useId();

    return (
        <article
            aria-labelledby={titleId}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white transition-colors hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-700"
        >
            <div className="flex flex-col sm:flex-row">
                {/* The lead decides its own height on a phone (a photograph needs one, a date strip
                    does not); from sm up it is a fixed-width column the full height of the card. */}
                <div className="relative shrink-0 sm:w-[120px]">{lead}</div>

                <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="label-caps inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <TypeIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden />
                            {typeLabel}
                        </span>
                        <span className="ml-auto">{statusNode ?? <StatusChip tone={status.tone}>{status.label}</StatusChip>}</span>
                    </div>

                    {/* What it is, and what it cost, on one line of sight. */}
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            {/* Two lines before it is cut: a property name is what a traveller looks for. */}
                            <h3 id={titleId} className="line-clamp-2 break-words text-pretty text-lg font-semibold leading-snug text-slate-900 dark:text-white">
                                {title}
                            </h3>
                            {subtitle && <p className="mt-0.5 truncate text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>}
                        </div>
                        {money && (
                            <div data-testid="card-money" className="shrink-0 text-right">
                                <Amount text={money.amount} muted={money.muted} />
                                {money.caption && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{money.caption}</p>}
                            </div>
                        )}
                    </div>

                    {facts.length > 0 && (
                        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                            {facts.map(fact => (
                                <li key={fact.label} className="inline-flex items-center gap-1.5">
                                    {fact.icon && <fact.icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden />}
                                    <span className={fact.mono ? 'font-mono tabular-nums' : undefined}>{fact.label}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {footnote && <div>{footnote}</div>}

                    {(primary || actions || links) && (
                        <div
                            data-testid="card-actions"
                            className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-100 pt-3 dark:border-slate-800"
                        >
                            {primary}
                            {actions}
                            {links && (
                                <div data-testid="card-links" className="ml-auto flex flex-wrap items-center justify-end gap-x-4">
                                    {links}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            {children}
        </article>
    );
}

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900';

/**
 * The primary action's look, so every card's main link is the same one. Tonal rather than solid:
 * a list repeats it once per booking, and five filled buttons in a column outshout the dates and
 * names a traveller came to read. The solid blue is kept for a page's own call to action.
 */
export const primaryActionClass =
    `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 ${ring}`;

export const ghostActionClass =
    `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 ${ring}`;

/** Destructive, so rose: the one place the system allows it. */
export const dangerActionClass =
    `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-rose-200 px-3 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500`;

/** A quiet, unboxed link for what a traveller needs sometimes, not every time. */
export const linkActionClass =
    `inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300 ${ring}`;

/**
 * When it happens, as the lead of a flight or a tee time: month, day and weekday, read on the
 * clock the event is on. Numbers are the numeric face so a column of cards lines up. A booking
 * still ahead is drawn in the accent; one that is over, or never happened, goes quiet.
 */
export function DateBlock({
    iso, timeZone, locale, tone = 'upcoming',
}: { iso: string; timeZone: string | null; locale: string; tone?: 'upcoming' | 'inactive' }) {
    const at = new Date(iso);
    const zone = timeZone ? { timeZone } : {};
    const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...options, ...zone }).format(at);
    const ahead = tone === 'upcoming';

    return (
        <div className={`flex items-baseline gap-2 border-b border-slate-100 px-4 py-2 dark:border-slate-800 sm:h-full sm:flex-col sm:items-center sm:justify-center sm:gap-0 sm:border-b-0 sm:px-3 sm:py-4 sm:text-center ${ahead
            ? 'bg-blue-50/70 dark:bg-blue-900/15'
            : 'bg-slate-50 dark:bg-slate-800/60'}`}>
            <span className={`label-caps ${ahead ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                {part({ month: 'short' })}
            </span>
            <span className={`font-mono text-xl font-bold leading-none tabular-nums sm:text-3xl ${ahead
                ? 'text-slate-900 dark:text-white'
                : 'text-slate-500 dark:text-slate-400'}`}>
                {part({ day: 'numeric' })}
            </span>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 sm:mt-1">{part({ weekday: 'short' })}</span>
        </div>
    );
}
