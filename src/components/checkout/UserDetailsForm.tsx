'use client';

import React from 'react';
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
}: UserDetailsFormProps) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <UserIcon size={20} className="text-blue-600" />
                Your details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">First Name *</label>
                    <input
                        name="firstName"
                        value={formData.firstName}
                        onChange={onInputChange}
                        type="text"
                        className={`w-full p-3 rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors.firstName ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                        placeholder="Enter first name"
                    />
                    <FieldError message={errors.firstName} />
                </div>
                <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Last Name *</label>
                    <input
                        name="lastName"
                        value={formData.lastName}
                        onChange={onInputChange}
                        type="text"
                        className={`w-full p-3 rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors.lastName ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                        placeholder="Enter last name"
                    />
                    <FieldError message={errors.lastName} />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Email *</label>
                    <input
                        name="email"
                        value={formData.email}
                        onChange={onInputChange}
                        type="email"
                        className={`w-full p-3 rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors.email ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                        placeholder="Enter email"
                    />
                    <FieldError message={errors.email} />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Phone</label>
                    <div className="flex gap-2">
                        <select
                            value={phoneCountryCode}
                            onChange={(e) => onPhoneCountryChange(e.target.value)}
                            className="w-32 p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 text-sm"
                        >
                            <option value="+63">PH (+63)</option>
                            <option value="+65">SG (+65)</option>
                            <option value="+60">MY (+60)</option>
                            <option value="+62">ID (+62)</option>
                            <option value="+66">TH (+66)</option>
                            <option value="+84">VN (+84)</option>
                            <option value="+82">KR (+82)</option>
                            <option value="+81">JPY (+81)</option>
                            <option value="+1">US (+1)</option>
                        </select>
                        <input
                            name="phone"
                            value={formData.phone}
                            onChange={onInputChange}
                            type="tel"
                            className="flex-1 p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500"
                            placeholder="Phone number"
                        />
                    </div>
                </div>

                {/* Work Travel */}
                <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Are you traveling for work?</label>
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                checked={isWorkTravel}
                                onChange={() => onWorkTravelChange(true)}
                                className="w-4 h-4 text-blue-600"
                            />
                            <span className="text-sm">Yes</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                checked={!isWorkTravel}
                                onChange={() => onWorkTravelChange(false)}
                                className="w-4 h-4 text-blue-600"
                            />
                            <span className="text-sm">No</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}
