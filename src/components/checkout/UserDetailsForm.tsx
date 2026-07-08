'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { User as UserIcon } from 'lucide-react';
import { CheckoutFormData } from './types';

interface UserDetailsFormProps {
    formData: CheckoutFormData;
    onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
    phoneCountryCode: string;
    onPhoneCountryChange: (value: string) => void;
    isWorkTravel: boolean;
    onWorkTravelChange: (value: boolean) => void;
    errors?: Record<string, string>;
    adults?: number;
    children?: number;
    onGuestChange?: (index: number, field: 'firstName' | 'lastName', value: string) => void;
    onChildChange?: (index: number, field: 'firstName' | 'lastName' | 'age', value: string) => void;
}

const FieldError = ({ message }: { message?: string }) =>
    message ? <p className="mt-1 text-xs text-red-500">{message}</p> : null;

export function UserDetailsForm({
    formData,
    onInputChange,
    phoneCountryCode,
    onPhoneCountryChange,
    isWorkTravel,
    onWorkTravelChange,
    errors = {},
    adults = 1,
    children = 0,
    onGuestChange,
    onChildChange,
}: UserDetailsFormProps) {
    const t = useTranslations('checkout');
    const additionalGuests = formData.additionalGuests ?? [];
    const childGuests = formData.childGuests ?? [];

    return (
        <div className="bg-white dark:bg-slate-900 rounded-lg lg:rounded-xl border border-slate-200 dark:border-white/10 p-3 lg:p-6 shadow-sm">
            <h2 className="text-[14px] lg:text-xl font-bold text-slate-900 dark:text-white mb-2 lg:mb-4 flex items-center gap-1.5 lg:gap-2">
                <UserIcon className="text-blue-600 w-4 h-4 lg:w-5 lg:h-5" />
                {t('userDetails.title')}
            </h2>

            {/* Guest 1 — primary contact */}
            {adults > 1 && (
                <p className="text-[10px] lg:text-xs font-bold uppercase text-blue-600 mb-1.5 lg:mb-2">Guest 1 (You)</p>
            )}
            <div className="grid grid-cols-2 gap-2.5 lg:gap-4">
                <div>
                    <label className="block text-[9px] lg:text-xs font-bold uppercase text-slate-500 mb-0.5 lg:mb-1">{t('userDetails.firstName')}</label>
                    <input
                        name="firstName"
                        value={formData.firstName}
                        onChange={onInputChange}
                        type="text"
                        className={`w-full min-w-0 px-2 py-1.5 lg:p-3 text-[11px] lg:text-sm rounded lg:rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors.firstName ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                        placeholder={t('userDetails.firstNamePlaceholder')}
                    />
                    <FieldError message={errors.firstName} />
                </div>
                <div>
                    <label className="block text-[9px] lg:text-xs font-bold uppercase text-slate-500 mb-0.5 lg:mb-1">{t('userDetails.lastName')}</label>
                    <input
                        name="lastName"
                        value={formData.lastName}
                        onChange={onInputChange}
                        type="text"
                        className={`w-full min-w-0 px-2 py-1.5 lg:p-3 text-[11px] lg:text-sm rounded lg:rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors.lastName ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                        placeholder={t('userDetails.lastNamePlaceholder')}
                    />
                    <FieldError message={errors.lastName} />
                </div>
                <div>
                    <label className="block text-[9px] lg:text-xs font-bold uppercase text-slate-500 mb-0.5 lg:mb-1">{t('userDetails.email')}</label>
                    <input
                        name="email"
                        value={formData.email}
                        onChange={onInputChange}
                        type="email"
                        className={`w-full min-w-0 px-2 py-1.5 lg:p-3 text-[11px] lg:text-sm rounded lg:rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors.email ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                        placeholder={t('userDetails.emailPlaceholder')}
                    />
                    <FieldError message={errors.email} />
                </div>
                <div>
                    <label className="block text-[9px] lg:text-xs font-bold uppercase text-slate-500 mb-0.5 lg:mb-1">{t('userDetails.phone')}</label>
                    <div className="flex flex-row gap-1 lg:gap-2">
                        <select
                            value={phoneCountryCode}
                            onChange={(e) => onPhoneCountryChange(e.target.value)}
                            className="w-[60px] lg:w-[85px] px-1 py-1.5 lg:p-3 rounded lg:rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 text-[10px] lg:text-sm text-center"
                        >
                            <option value="+63">+63</option>
                            <option value="+65">+65</option>
                            <option value="+60">+60</option>
                            <option value="+62">+62</option>
                            <option value="+66">+66</option>
                            <option value="+84">+84</option>
                            <option value="+82">+82</option>
                            <option value="+81">+81</option>
                            <option value="+1">+1</option>
                        </select>
                        <input
                            name="phone"
                            value={formData.phone}
                            onChange={onInputChange}
                            type="tel"
                            className="flex-1 min-w-0 px-2 py-1.5 lg:p-3 rounded lg:rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 text-[11px] lg:text-sm"
                            placeholder={t('userDetails.phonePlaceholder')}
                        />
                    </div>
                </div>

                {/* Work Travel */}
                <div className="col-span-2 mt-1">
                    <label className="block text-[9px] lg:text-xs font-bold uppercase text-slate-500 mb-1 lg:mb-2">{t('userDetails.travelingForWork')}</label>
                    <div className="flex flex-wrap gap-3 lg:gap-4">
                        <label className="flex items-center gap-1.5 lg:gap-2 cursor-pointer">
                            <input
                                type="radio"
                                checked={isWorkTravel}
                                onChange={() => onWorkTravelChange(true)}
                                className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-blue-600"
                            />
                            <span className="text-[11px] lg:text-sm">{t('userDetails.yes')}</span>
                        </label>
                        <label className="flex items-center gap-1.5 lg:gap-2 cursor-pointer">
                            <input
                                type="radio"
                                checked={!isWorkTravel}
                                onChange={() => onWorkTravelChange(false)}
                                className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-blue-600"
                            />
                            <span className="text-[11px] lg:text-sm">{t('userDetails.no')}</span>
                        </label>
                    </div>
                </div>
            </div>

            {/* Additional adult guests (Guest 2..N) */}
            {adults > 1 && Array.from({ length: adults - 1 }, (_, i) => {
                const guest = additionalGuests[i] ?? { firstName: '', lastName: '' };
                return (
                    <div key={i} className="mt-3 lg:mt-5 pt-3 lg:pt-5 border-t border-slate-100 dark:border-white/5">
                        <p className="text-[10px] lg:text-xs font-bold uppercase text-blue-600 mb-1.5 lg:mb-2">Guest {i + 2}</p>
                        <div className="grid grid-cols-2 gap-2.5 lg:gap-4">
                            <div>
                                <label className="block text-[9px] lg:text-xs font-bold uppercase text-slate-500 mb-0.5 lg:mb-1">First Name *</label>
                                <input
                                    value={guest.firstName}
                                    onChange={e => onGuestChange?.(i, 'firstName', e.target.value)}
                                    type="text"
                                    className={`w-full min-w-0 px-2 py-1.5 lg:p-3 text-[11px] lg:text-sm rounded lg:rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors[`guest_${i}_firstName`] ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                                    placeholder="First name"
                                />
                                <FieldError message={errors[`guest_${i}_firstName`]} />
                            </div>
                            <div>
                                <label className="block text-[9px] lg:text-xs font-bold uppercase text-slate-500 mb-0.5 lg:mb-1">Last Name *</label>
                                <input
                                    value={guest.lastName}
                                    onChange={e => onGuestChange?.(i, 'lastName', e.target.value)}
                                    type="text"
                                    className={`w-full min-w-0 px-2 py-1.5 lg:p-3 text-[11px] lg:text-sm rounded lg:rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors[`guest_${i}_lastName`] ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                                    placeholder="Last name"
                                />
                                <FieldError message={errors[`guest_${i}_lastName`]} />
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Child guests */}
            {children > 0 && Array.from({ length: children }, (_, i) => {
                const child = childGuests[i] ?? { firstName: '', lastName: '', age: '' };
                return (
                    <div key={`child-${i}`} className="mt-3 lg:mt-5 pt-3 lg:pt-5 border-t border-slate-100 dark:border-white/5">
                        <p className="text-[10px] lg:text-xs font-bold uppercase text-amber-600 mb-1.5 lg:mb-2">Child {i + 1}</p>
                        <div className="grid grid-cols-2 gap-2.5 lg:gap-4">
                            <div>
                                <label className="block text-[9px] lg:text-xs font-bold uppercase text-slate-500 mb-0.5 lg:mb-1">First Name *</label>
                                <input
                                    value={child.firstName}
                                    onChange={e => onChildChange?.(i, 'firstName', e.target.value)}
                                    type="text"
                                    className={`w-full min-w-0 px-2 py-1.5 lg:p-3 text-[11px] lg:text-sm rounded lg:rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors[`child_${i}_firstName`] ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                                    placeholder="First name"
                                />
                                <FieldError message={errors[`child_${i}_firstName`]} />
                            </div>
                            <div>
                                <label className="block text-[9px] lg:text-xs font-bold uppercase text-slate-500 mb-0.5 lg:mb-1">Last Name *</label>
                                <input
                                    value={child.lastName}
                                    onChange={e => onChildChange?.(i, 'lastName', e.target.value)}
                                    type="text"
                                    className={`w-full min-w-0 px-2 py-1.5 lg:p-3 text-[11px] lg:text-sm rounded lg:rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors[`child_${i}_lastName`] ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                                    placeholder="Last name"
                                />
                                <FieldError message={errors[`child_${i}_lastName`]} />
                            </div>
                            <div>
                                <label className="block text-[9px] lg:text-xs font-bold uppercase text-slate-500 mb-0.5 lg:mb-1">Age *</label>
                                <input
                                    value={child.age}
                                    onChange={e => onChildChange?.(i, 'age', e.target.value)}
                                    type="number"
                                    min="0"
                                    max="17"
                                    className={`w-full min-w-0 px-2 py-1.5 lg:p-3 text-[11px] lg:text-sm rounded lg:rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors[`child_${i}_age`] ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                                    placeholder="0–17"
                                />
                                <FieldError message={errors[`child_${i}_age`]} />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
