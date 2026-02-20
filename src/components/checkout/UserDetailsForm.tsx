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
        <div className="bg-white dark:bg-slate-900 rounded-lg sm:rounded-xl border border-slate-200 dark:border-white/10 p-3 sm:p-6 shadow-sm">
            <h2 className="text-base sm:text-xl font-bold text-slate-900 dark:text-white mb-2 sm:mb-4 flex items-center gap-1.5 sm:gap-2">
                <UserIcon className="text-blue-600 w-4 h-4 sm:w-5 sm:h-5" />
                Your details
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                <div>
                    <label className="block text-[9px] sm:text-xs font-bold uppercase text-slate-500 mb-0.5 sm:mb-1">First Name *</label>
                    <input
                        name="firstName"
                        value={formData.firstName}
                        onChange={onInputChange}
                        type="text"
                        className={`w-full min-w-0 px-2 py-1.5 sm:p-3 text-xs sm:text-sm rounded sm:rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors.firstName ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                        placeholder="First name"
                    />
                    <FieldError message={errors.firstName} />
                </div>
                <div>
                    <label className="block text-[9px] sm:text-xs font-bold uppercase text-slate-500 mb-0.5 sm:mb-1">Last Name *</label>
                    <input
                        name="lastName"
                        value={formData.lastName}
                        onChange={onInputChange}
                        type="text"
                        className={`w-full min-w-0 px-2 py-1.5 sm:p-3 text-xs sm:text-sm rounded sm:rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors.lastName ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                        placeholder="Last name"
                    />
                    <FieldError message={errors.lastName} />
                </div>
                <div>
                    <label className="block text-[9px] sm:text-xs font-bold uppercase text-slate-500 mb-0.5 sm:mb-1">Email *</label>
                    <input
                        name="email"
                        value={formData.email}
                        onChange={onInputChange}
                        type="email"
                        className={`w-full min-w-0 px-2 py-1.5 sm:p-3 text-xs sm:text-sm rounded sm:rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors.email ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                        placeholder="Email"
                    />
                    <FieldError message={errors.email} />
                </div>
                <div>
                    <label className="block text-[9px] sm:text-xs font-bold uppercase text-slate-500 mb-0.5 sm:mb-1">Phone</label>
                    <div className="flex flex-row gap-1 sm:gap-2">
                        <select
                            value={phoneCountryCode}
                            onChange={(e) => onPhoneCountryChange(e.target.value)}
                            className="w-[60px] sm:w-[85px] px-1 py-1.5 sm:p-3 rounded sm:rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 text-[10px] sm:text-sm text-center"
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
                            className="flex-1 min-w-0 px-2 py-1.5 sm:p-3 rounded sm:rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 text-xs sm:text-sm"
                            placeholder="Number"
                        />
                    </div>
                </div>

                {/* Work Travel */}
                <div className="col-span-2 mt-1">
                    <label className="block text-[9px] sm:text-xs font-bold uppercase text-slate-500 mb-1 sm:mb-2">Traveling for work?</label>
                    <div className="flex flex-wrap gap-3 sm:gap-4">
                        <label className="flex items-center gap-1.5 sm:gap-2 cursor-pointer">
                            <input
                                type="radio"
                                checked={isWorkTravel}
                                onChange={() => onWorkTravelChange(true)}
                                className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600"
                            />
                            <span className="text-xs sm:text-sm">Yes</span>
                        </label>
                        <label className="flex items-center gap-1.5 sm:gap-2 cursor-pointer">
                            <input
                                type="radio"
                                checked={!isWorkTravel}
                                onChange={() => onWorkTravelChange(false)}
                                className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600"
                            />
                            <span className="text-xs sm:text-sm">No</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}
