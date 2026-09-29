"use client";

import React from 'react';
import { useTranslations } from 'next-intl';
import { Mail, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import {
    BookCard,
    BOOK_FIELD_GRID,
    FULL_WIDTH,
    FieldError,
    FieldLabel,
    MENU_ITEM,
    MENU_ITEM_ACTIVE,
    PillTrigger,
    bookFieldClass,
} from '@/components/flights/booking/BookCard';
import type { FlightContactForm } from '@/lib/schemas/flight';

/*
 * The booking's contact and billing cards, drawn as the passenger card is:
 * a blue glyph beside the title, the required-fields line, and labelled pill
 * fields in two columns.
 */

export const PHONE_CODES = [
    { code: '82', country: 'KR', label: '+82 (KR)' },
    { code: '63', country: 'PH', label: '+63 (PH)' },
    { code: '1',  country: 'US', label: '+1 (US/CA)' },
    { code: '81', country: 'JP', label: '+81 (JP)' },
    { code: '86', country: 'CN', label: '+86 (CN)' },
    { code: '44', country: 'GB', label: '+44 (GB)' },
    { code: '61', country: 'AU', label: '+61 (AU)' },
    { code: '49', country: 'DE', label: '+49 (DE)' },
    { code: '33', country: 'FR', label: '+33 (FR)' },
    { code: '65', country: 'SG', label: '+65 (SG)' },
    { code: '66', country: 'TH', label: '+66 (TH)' },
    { code: '84', country: 'VN', label: '+84 (VN)' },
    { code: '91', country: 'IN', label: '+91 (IN)' },
    { code: '60', country: 'MY', label: '+60 (MY)' },
] as const;

const COUNTRIES = ['KR', 'PH', 'US', 'JP', 'CN', 'GB', 'AU', 'CA', 'DE', 'FR', 'SG', 'TH', 'VN', 'IN', 'MY'] as const;

type ContactField = keyof FlightContactForm;

interface ContactCardProps {
    contact:    FlightContactForm;
    /** The form's field errors, keyed `contact.<field>`. */
    errors:     Record<string, string>;
    onChange:   (field: ContactField, value: string) => void;
    /** Validate one field by its form path, e.g. `contact.email`. */
    onValidate: (path: string, value: string) => void;
}

export function ContactInformationCard({ contact, errors, onChange, onValidate }: ContactCardProps) {
    const t = useTranslations('flightBook');
    const emailError = errors['contact.email'];
    const phoneError = errors['contact.phone'];

    return (
        <BookCard icon={Mail} title={t('contact.title')} requiredNote>
            <div className={BOOK_FIELD_GRID}>
                <div>
                    <FieldLabel text={t('contact.email')} htmlFor="contact-email" />
                    <input
                        id="contact-email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="john@gmail.com"
                        data-field="contact.email"
                        aria-invalid={!!emailError}
                        value={contact.email}
                        onChange={e => onChange('email', e.target.value)}
                        onBlur={e => onValidate('contact.email', e.target.value)}
                        className={bookFieldClass(!!emailError)}
                    />
                    <FieldError message={emailError} />
                </div>

                <div>
                    <FieldLabel text={t('contact.phone')} htmlFor="contact-phone" />
                    <div className="flex gap-2">
                        <div className="w-[104px] shrink-0">
                            <DropdownMenu className={FULL_WIDTH}>
                                <PillTrigger className="px-3">+{contact.countryCode}</PillTrigger>
                                <DropdownMenuContent align="start" className="rounded-xl min-w-30 max-h-75 overflow-y-auto z-1001">
                                    {PHONE_CODES.map(p => (
                                        <DropdownMenuItem
                                            key={p.code}
                                            onClick={() => onChange('countryCode', p.code)}
                                            className={cn(MENU_ITEM, contact.countryCode === p.code ? MENU_ITEM_ACTIVE : 'text-slate-700 dark:text-slate-300')}
                                        >
                                            {p.label}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                        <input
                            id="contact-phone"
                            type="tel"
                            required
                            autoComplete="tel-national"
                            placeholder="912 345 6789"
                            data-field="contact.phone"
                            aria-invalid={!!phoneError}
                            value={contact.phone}
                            onChange={e => onChange('phone', e.target.value)}
                            onBlur={e => onValidate('contact.phone', e.target.value)}
                            className={bookFieldClass(!!phoneError, 'flex-1 min-w-0')}
                        />
                    </div>
                    <FieldError message={phoneError} />
                </div>
            </div>
        </BookCard>
    );
}

export function BillingAddressCard({ contact, errors, onChange }: Omit<ContactCardProps, 'onValidate'>) {
    const t = useTranslations('flightBook');

    const textField = (field: 'addressLine' | 'city' | 'postalCode', label: string, placeholder: string, autoComplete: string, className = '') => (
        <div className={className}>
            <FieldLabel text={label} htmlFor={`contact-${field}`} />
            <input
                id={`contact-${field}`}
                type="text"
                required
                autoComplete={autoComplete}
                placeholder={placeholder}
                aria-invalid={!!errors[`contact.${field}`]}
                value={contact[field] ?? ''}
                onChange={e => onChange(field, e.target.value)}
                className={bookFieldClass(!!errors[`contact.${field}`])}
            />
            <FieldError message={errors[`contact.${field}`]} />
        </div>
    );

    return (
        <BookCard icon={MapPin} title={t('address.title')} requiredNote>
            <div className={BOOK_FIELD_GRID}>
                {textField('addressLine', t('address.addressLine'), '123 Main Street', 'street-address', 'sm:col-span-2')}
                {textField('city', t('address.city'), 'Seoul', 'address-level2')}
                {textField('postalCode', t('address.postalCode'), '04524', 'postal-code')}
                <div className="sm:col-span-2">
                    <FieldLabel text={t('address.country')} id="contact-country-label" />
                    <DropdownMenu className={FULL_WIDTH}>
                        <PillTrigger labelledBy="contact-country-label">
                            {COUNTRIES.includes(contact.country as typeof COUNTRIES[number])
                                ? t(`countries.${contact.country}`)
                                : <span className="text-[#c4c8cf] dark:text-slate-500">{t('countries.US')}</span>}
                        </PillTrigger>
                        <DropdownMenuContent align="start" className="rounded-xl min-w-50 max-h-75 overflow-y-auto z-1001">
                            {COUNTRIES.map(code => (
                                <DropdownMenuItem
                                    key={code}
                                    onClick={() => onChange('country', code)}
                                    className={cn(MENU_ITEM, contact.country === code ? MENU_ITEM_ACTIVE : 'text-slate-700 dark:text-slate-300')}
                                >
                                    <span className="text-[9px] text-slate-400 font-bold w-6">{code}</span>
                                    <span>{t(`countries.${code}`)}</span>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </BookCard>
    );
}
