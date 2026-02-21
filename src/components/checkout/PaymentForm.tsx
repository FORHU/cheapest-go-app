'use client';

import React from 'react';
import { CreditCard, Lock, ShieldCheck } from 'lucide-react';
import { CheckoutFormData } from './types';

interface PaymentFormProps {
    formData: CheckoutFormData;
    onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
    payeeFirstName: string;
    payeeLastName: string;
    onPayeeFirstNameChange: (value: string) => void;
    onPayeeLastNameChange: (value: string) => void;
    errors?: Record<string, string>;
}

const FieldError = ({ message }: { message?: string }) =>
    message ? <p className="mt-1 text-xs text-red-500">{message}</p> : null;

export function PaymentForm({
    formData,
    onInputChange,
    payeeFirstName,
    payeeLastName,
    onPayeeFirstNameChange,
    onPayeeLastNameChange,
    errors = {},
}: PaymentFormProps) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-lg lg:rounded-xl border border-slate-200 dark:border-white/10 p-3 lg:p-6 shadow-sm">
            <h2 className="text-[14px] lg:text-xl font-bold text-slate-900 dark:text-white mb-2 lg:mb-4 flex items-center gap-1.5 lg:gap-2">
                <CreditCard className="text-blue-600 w-4 h-4 lg:w-5 lg:h-5" />
                Payment Information
            </h2>
            <div className="flex gap-4 mb-3 lg:mb-6">
                <button className="flex-1 py-1.5 lg:py-3 text-[11px] lg:text-base border-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-bold rounded lg:rounded-lg flex items-center justify-center gap-1.5 lg:gap-2">
                    <CreditCard className="w-3.5 h-3.5 lg:w-[18px] lg:h-[18px]" /> Card
                </button>
            </div>

            <div className="space-y-2.5 lg:space-y-4">
                <div>
                    <div className="relative">
                        <Lock className="absolute left-2 lg:left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5 lg:w-4 lg:h-4" />
                        <input
                            name="cardNumber"
                            value={formData.cardNumber}
                            onChange={onInputChange}
                            type="text"
                            className={`w-full min-w-0 px-2 py-1.5 lg:p-3 pl-7 lg:pl-10 text-[11px] lg:text-sm rounded lg:rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors.cardNumber ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                            placeholder="Card number"
                        />
                    </div>
                    <FieldError message={errors.cardNumber} />
                </div>
                <div className="grid grid-cols-2 gap-2.5 lg:gap-4">
                    <div>
                        <input
                            name="expiry"
                            value={formData.expiry}
                            onChange={onInputChange}
                            type="text"
                            className={`w-full min-w-0 px-2 py-1.5 lg:p-3 text-[11px] lg:text-sm rounded lg:rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors.expiry ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                            placeholder="MM / YY"
                        />
                        <FieldError message={errors.expiry} />
                    </div>
                    <div>
                        <input
                            name="cvc"
                            value={formData.cvc}
                            onChange={onInputChange}
                            type="text"
                            className={`w-full min-w-0 px-2 py-1.5 lg:p-3 text-[11px] lg:text-sm rounded lg:rounded-lg border bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500 ${errors.cvc ? 'border-red-400' : 'border-slate-200 dark:border-white/10'}`}
                            placeholder="Security code"
                        />
                        <FieldError message={errors.cvc} />
                    </div>
                </div>

                {/* Country Dropdown */}
                <div>
                    <label className="block text-[9px] lg:text-xs font-bold uppercase text-slate-500 mb-0.5 lg:mb-1">Country</label>
                    <select
                        name="cardCountry"
                        value={formData.cardCountry || "PH"}
                        onChange={onInputChange}
                        className="w-full px-2 py-1.5 lg:p-3 text-[11px] lg:text-sm rounded lg:rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500"
                    >
                        <option value="PH">Philippines</option>
                        <option value="SG">Singapore</option>
                        <option value="MY">Malaysia</option>
                        <option value="ID">Indonesia</option>
                        <option value="TH">Thailand</option>
                        <option value="VN">Vietnam</option>
                        <option value="KR">South Korea</option>
                        <option value="JP">Japan</option>
                        <option value="US">United States</option>
                    </select>
                </div>

                {/* Payee Names */}
                <div className="grid grid-cols-2 gap-2.5 lg:gap-4">
                    <div>
                        <label className="block text-[9px] lg:text-xs font-bold uppercase text-slate-500 mb-0.5 lg:mb-1">Payee First Name</label>
                        <input
                            value={payeeFirstName}
                            onChange={(e) => onPayeeFirstNameChange(e.target.value)}
                            type="text"
                            className="w-full min-w-0 px-2 py-1.5 lg:p-3 text-[11px] lg:text-sm rounded lg:rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] lg:text-xs font-bold uppercase text-slate-500 mb-0.5 lg:mb-1">Payee Last Name</label>
                        <input
                            value={payeeLastName}
                            onChange={(e) => onPayeeLastNameChange(e.target.value)}
                            type="text"
                            className="w-full min-w-0 px-2 py-1.5 lg:p-3 text-[11px] lg:text-sm rounded lg:rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 outline-none focus:border-blue-500"
                        />
                    </div>
                </div>
            </div>

            <div className="mt-3 lg:mt-6 flex items-start gap-1.5 lg:gap-3">
                <ShieldCheck className="text-green-600 shrink-0 mt-0.5 w-3.5 h-3.5 lg:w-[18px] lg:h-[18px]" />
                <p className="text-[10px] lg:text-xs text-slate-500">
                    Your payment information is secured.
                </p>
            </div>
        </div>
    );
}
