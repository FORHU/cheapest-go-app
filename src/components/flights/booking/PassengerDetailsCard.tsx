"use client";

import React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FormDatePicker } from '@/components/common/FormDatePicker';
import {
    BookCard,
    BOOK_FIELD_GRID,
    FULL_WIDTH,
    FieldError,
    FieldLabel,
    MENU_ITEM,
    MENU_ITEM_ACTIVE,
    PillTrigger,
    TRAILING_ICON,
    bookFieldClass,
} from '@/components/flights/booking/BookCard';
import type { FlightPassengerForm } from '@/lib/schemas/flight';

export { bookFieldClass };

/*
 * One passenger's card on the flight book page, as the design draws it: the
 * book page's card (see BookCard) with a blue person glyph beside "First
 * Passenger", and two columns of pill fields — names, sex and country, the
 * passport and its expiry, then the birthdate on its own.
 */

const PASSENGER_TYPES = [
    { code: 'ADT', key: 'adult' },
    { code: 'CHD', key: 'child' },
    { code: 'INF', key: 'infant' },
] as const;

const GENDERS = [
    { value: 'M', key: 'male' },
    { value: 'F', key: 'female' },
] as const;

const NATIONALITIES = ['KR', 'PH', 'US', 'JP', 'CN', 'GB', 'AU', 'CA', 'DE', 'FR', 'SG', 'TH', 'VN', 'IN', 'MY'] as const;

/**
 * The date picker's trigger as the design's pill: the picker's own padding,
 * type size, hover tint and shadow undone, the calendar glyph in the text
 * colour, and its "DD/MM/YY" placeholder in the placeholder grey until a date
 * is picked.
 */
function dateFieldClass(hasError: boolean, empty: boolean): string {
    return bookFieldClass(hasError, cn(
        'py-0 lg:py-0 px-4 lg:px-4 text-[13px] lg:text-[14px] shadow-none',
        hasError ? 'hover:border-red-500' : 'hover:border-[#d9d9d9] dark:hover:border-slate-700',
        TRAILING_ICON,
        empty && 'text-[#c4c8cf] dark:text-slate-500',
    ));
}

/**
 * Month the birthdate calendar opens on — a typical adult's birth year rather
 * than today, three decades of paging away.
 */
function defaultBirthdateView(): Date {
    return new Date(new Date().getFullYear() - 30, 0, 1);
}

export interface PassengerDetailsCardProps {
    index:      number;
    passenger:  FlightPassengerForm;
    /** The form's field errors, keyed `passengers.<index>.<field>`. */
    errors:     Record<string, string>;
    canRemove:  boolean;
    onChange:   (field: keyof FlightPassengerForm, value: string) => void;
    /** Validate one field by its form path, e.g. `passengers.0.firstName`. */
    onValidate: (path: string, value: string) => void;
    onRemove:   () => void;
}

export function PassengerDetailsCard({ index, passenger: pax, errors, canRemove, onChange, onValidate, onRemove }: PassengerDetailsCardProps) {
    const t = useTranslations('flightBook');
    const path  = (field: keyof FlightPassengerForm) => `passengers.${index}.${field}`;
    const id    = (field: keyof FlightPassengerForm) => `passenger-${index}-${field}`;
    const error = (field: keyof FlightPassengerForm) => errors[path(field)];

    const textField = (field: 'firstName' | 'lastName' | 'passport', label: string, placeholder: string) => (
        <div>
            <FieldLabel text={label} htmlFor={id(field)} />
            <input
                id={id(field)}
                type="text"
                required
                data-field={path(field)}
                aria-invalid={!!error(field)}
                placeholder={placeholder}
                value={pax[field]}
                onChange={e => onChange(field, e.target.value)}
                onBlur={e => onValidate(path(field), e.target.value)}
                className={bookFieldClass(!!error(field))}
            />
            <FieldError message={error(field)} />
        </div>
    );

    const aside = (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button type="button" className="flex items-center gap-1.5 h-9 px-4 text-[13px] lg:text-[14px] bg-white dark:bg-slate-900 border border-[#d9d9d9] dark:border-slate-700 rounded-full text-[#1c1b1f] dark:text-white group">
                        <span>{t(`passenger.${PASSENGER_TYPES.find(pt => pt.code === pax.type)?.key ?? 'adult'}`)}</span>
                        <ChevronDown size={14} className="transition-transform group-data-[state=open]:rotate-180" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl min-w-25 z-1001">
                    {PASSENGER_TYPES.map(pt => (
                        <DropdownMenuItem key={pt.code} onClick={() => onChange('type', pt.code)} className={cn(MENU_ITEM, pax.type === pt.code ? MENU_ITEM_ACTIVE : 'text-slate-700 dark:text-slate-300')}>
                            {t(`passenger.${pt.key}`)}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
            {canRemove && (
                <button type="button" onClick={onRemove} className="text-[11px] lg:text-xs text-red-500 hover:text-red-400">
                    {t('passenger.remove')}
                </button>
            )}
        </>
    );

    return (
        <BookCard icon={User} title={t('passenger.ordinalTitle', { number: index + 1 })} requiredNote aside={aside}>
            <div className={BOOK_FIELD_GRID}>
                {textField('firstName', t('passenger.firstName'), 'John')}
                {textField('lastName', t('passenger.lastName'), 'Doe')}

                <div>
                    <FieldLabel text={t('passenger.gender')} id={`${id('gender')}-label`} />
                    <DropdownMenu className={FULL_WIDTH}>
                        <PillTrigger labelledBy={`${id('gender')}-label`}>
                            {t(`genderOptions.${pax.gender === 'F' ? 'female' : 'male'}`)}
                        </PillTrigger>
                        <DropdownMenuContent align="start" className="rounded-xl min-w-35 z-1001">
                            {GENDERS.map(g => (
                                <DropdownMenuItem key={g.value} onClick={() => onChange('gender', g.value)} className={cn(MENU_ITEM, pax.gender === g.value ? MENU_ITEM_ACTIVE : 'text-slate-700 dark:text-slate-300')}>
                                    {t(`genderOptions.${g.key}`)}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div>
                    <FieldLabel text={t('passenger.nationality')} id={`${id('nationality')}-label`} />
                    <DropdownMenu className={FULL_WIDTH}>
                        <PillTrigger labelledBy={`${id('nationality')}-label`}>
                            {NATIONALITIES.includes(pax.nationality as typeof NATIONALITIES[number]) ? t(`countries.${pax.nationality}`) : ''}
                        </PillTrigger>
                        <DropdownMenuContent align="start" className="rounded-xl min-w-50 max-h-75 overflow-y-auto z-1001">
                            {NATIONALITIES.map(code => (
                                <DropdownMenuItem key={code} onClick={() => onChange('nationality', code)} className={cn(MENU_ITEM, pax.nationality === code ? MENU_ITEM_ACTIVE : 'text-slate-700 dark:text-slate-300')}>
                                    <span className="text-[9px] text-slate-400 font-bold w-6">{code}</span>
                                    <span>{t(`countries.${code}`)}</span>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {textField('passport', t('passenger.passport'), 'P12345678')}

                <div data-field={path('passportExpiry')}>
                    <FieldLabel text={t('passenger.passportExpiry')} />
                    <FormDatePicker
                        placeholder="DD/MM/YY"
                        value={pax.passportExpiry}
                        onChange={val => { onChange('passportExpiry', val); onValidate(path('passportExpiry'), val); }}
                        minDate={new Date()}
                        required
                        rootClassName={FULL_WIDTH}
                        className={dateFieldClass(!!error('passportExpiry'), !pax.passportExpiry)}
                    />
                    <FieldError message={error('passportExpiry')} />
                </div>

                <div data-field={path('birthDate')}>
                    <FieldLabel text={t('passenger.birthdate')} />
                    <FormDatePicker
                        placeholder="DD/MM/YY"
                        value={pax.birthDate}
                        onChange={val => { onChange('birthDate', val); onValidate(path('birthDate'), val); }}
                        maxDate={new Date()}
                        defaultViewDate={defaultBirthdateView()}
                        required
                        rootClassName={FULL_WIDTH}
                        className={dateFieldClass(!!error('birthDate'), !pax.birthDate)}
                    />
                    <FieldError message={error('birthDate')} />
                </div>
            </div>
        </BookCard>
    );
}
