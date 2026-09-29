"use client";

import React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { RESULT_CARD_RESTING } from '@/components/flights/FilterCard';

/*
 * The flight book page's card: the search page's card surface, a blue glyph
 * beside a 16px title, and fields labelled above 36px pills outlined in grey
 * that turn blue while focused.
 */

/**
 * The card surface — the search page's result card, so the flight card and
 * every form card beside it read as one set: white, 16px corners, a faint
 * border and a soft shadow. The resting version, without the hover lift,
 * since these cards are not picked from a list.
 */
export const BOOK_CARD = `${RESULT_CARD_RESTING} w-full`;

/** The card's inset around a form — the result card's own. */
export const BOOK_CARD_PADDING = 'p-4 lg:p-6';

/** The card's inset around a collapsible header row. */
export const BOOK_CARD_ROW_PADDING = 'px-4 py-4 lg:px-6 lg:py-5';

/** The inset of a collapsible card's body, lined up with its header. */
export const BOOK_CARD_BODY_PADDING = 'px-4 lg:px-6';

/** The blue glyph beside a card title. */
export const BOOK_CARD_ICON = 'w-5 h-5 lg:w-6 lg:h-6 shrink-0 text-blue-600 dark:text-blue-400';

/** A card title's type. */
export const BOOK_CARD_TITLE = 'text-[15px] lg:text-[16px] font-normal text-[#1c1b1f] dark:text-white';

/** A card's two-column field grid. */
export const BOOK_FIELD_GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 lg:gap-y-[18px]';

/**
 * The design's field: a 36px pill outlined in grey, blue while focused (or
 * while its menu is open), red once it has failed validation.
 */
export function bookFieldClass(hasError: boolean, extra = ''): string {
    return cn(
        'w-full h-9 px-4 rounded-full border bg-white dark:bg-slate-900 text-[14px] text-[#1c1b1f] dark:text-white',
        'placeholder:text-[#c4c8cf] dark:placeholder:text-slate-500 focus:outline-none transition-colors',
        hasError
            ? 'border-red-500 focus:border-red-500'
            : 'border-[#d9d9d9] dark:border-slate-700 focus:border-blue-600 dark:focus:border-blue-400 data-[state=open]:border-blue-600',
        extra,
    );
}

/** The design's trailing glyphs — the select chevron and the calendar — are drawn in the text colour. */
export const TRAILING_ICON = '[&>svg]:text-[#1c1b1f] dark:[&>svg]:text-white [&>svg]:shrink-0';

/** The dropdown's wrapper is inline-block by default, which would shrink a pill to its text. */
export const FULL_WIDTH = 'block w-full';

export const MENU_ITEM = 'flex items-center gap-2 px-3 py-2 text-[12px] cursor-pointer';
export const MENU_ITEM_ACTIVE = 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400';

/** The design's red asterisk. */
export function RequiredMark() {
    return <span aria-hidden className="text-red-500">*</span>;
}

/**
 * A field label from the locale's copy, which already carries the required
 * marker ("Email Address *"): the words, then the marker drawn in red.
 */
export function FieldLabel({ text, htmlFor, id }: { text: string; htmlFor?: string; id?: string }) {
    const required = /\s*\*\s*$/.test(text);
    const words = text.replace(/\s*\*\s*$/, '');
    return (
        <label htmlFor={htmlFor} id={id} className="block mb-1.5 text-[13px] lg:text-[14px] leading-[17px] text-[#1c1b1f] dark:text-white">
            {words}{required && <> <RequiredMark /></>}
        </label>
    );
}

/** One field's complaint beneath it, announced when it appears. */
export function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return <p role="alert" className="mt-1 text-[11px] text-red-600 dark:text-red-400">{message}</p>;
}

/** A dropdown trigger dressed as the design's pill field, stretched across its column. */
export function PillTrigger({ labelledBy, className, children }: { labelledBy?: string; className?: string; children: React.ReactNode }) {
    return (
        <DropdownMenuTrigger asChild>
            <button type="button" aria-labelledby={labelledBy} className={bookFieldClass(false, cn('flex items-center justify-between gap-2 text-left group', TRAILING_ICON, className))}>
                <span className="truncate">{children}</span>
                <ChevronDown size={16} className="transition-transform group-data-[state=open]:rotate-180" />
            </button>
        </DropdownMenuTrigger>
    );
}

/**
 * A card's heading: the blue glyph and title, the "Fields marked with * are
 * required" line under them when the card holds required fields, and
 * anything the card puts on the right (the passenger type, Remove).
 */
export function BookCardHeader({ icon: Icon, title, requiredNote, aside, headingLevel = 'h2' }: {
    icon:          LucideIcon;
    title:         React.ReactNode;
    requiredNote?: boolean;
    aside?:        React.ReactNode;
    headingLevel?: 'h2' | 'h3';
}) {
    const t = useTranslations('flightBook');
    const Heading = headingLevel;
    return (
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                    <Icon className={BOOK_CARD_ICON} strokeWidth={1.75} aria-hidden />
                    <Heading className={BOOK_CARD_TITLE}>{title}</Heading>
                </div>
                {requiredNote && (
                    <p className="mt-2 text-[11px] lg:text-[12px] text-[#1c1b1f] dark:text-slate-300">
                        {t.rich('passenger.requiredNote', { req: chunks => <span aria-hidden className="text-red-500">{chunks}</span> })}
                    </p>
                )}
            </div>
            {aside && <div className="flex items-center gap-2 shrink-0">{aside}</div>}
        </div>
    );
}

/** A form card: the surface, its padding, a header and the fields under it. */
export function BookCard({ className, children, ...header }: React.ComponentProps<typeof BookCardHeader> & { className?: string; children: React.ReactNode }) {
    return (
        <section className={cn(BOOK_CARD, BOOK_CARD_PADDING, className)}>
            <BookCardHeader {...header} />
            <div className="mt-5">{children}</div>
        </section>
    );
}

/**
 * A card that opens and closes from its header row — the optional extras and
 * the fare rules: glyph and title, a line under the title, a chevron that
 * turns while open. The body stays mounted when closed (`keepMounted`) so
 * panels that fetch on mount still load with the page.
 */
export function BookCollapsibleCard({ icon: Icon, title, subtitle, open, onToggle, trailing, keepMounted = false, className, children }: {
    icon:         LucideIcon;
    title:        React.ReactNode;
    subtitle?:    React.ReactNode;
    open:         boolean;
    onToggle:     () => void;
    /** Shown before the chevron — a spinner, a badge. */
    trailing?:    React.ReactNode;
    keepMounted?: boolean;
    className?:   string;
    children:     React.ReactNode;
}) {
    return (
        <section className={cn(BOOK_CARD, 'overflow-hidden', className)}>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className={cn('w-full flex items-center gap-3 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/60 transition-colors', BOOK_CARD_ROW_PADDING)}
            >
                <Icon className={BOOK_CARD_ICON} strokeWidth={1.75} aria-hidden />
                <span className="flex-1 min-w-0">
                    <span className={cn('block', BOOK_CARD_TITLE)}>{title}</span>
                    {subtitle && <span className="block mt-0.5 text-[11px] lg:text-[12px] text-[#939fb1] dark:text-slate-400">{subtitle}</span>}
                </span>
                {trailing}
                <ChevronDown size={16} className={cn('shrink-0 text-[#1c1b1f] dark:text-white transition-transform', open && 'rotate-180')} aria-hidden />
            </button>
            {(open || keepMounted) && (
                <div hidden={!open} className={cn('border-t border-slate-100 dark:border-slate-800 pt-3 pb-4', BOOK_CARD_BODY_PADDING)}>
                    {children}
                </div>
            )}
        </section>
    );
}
