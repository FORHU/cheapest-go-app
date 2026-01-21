"use client";

import React from 'react';
import { Clock, Baby, PawPrint, CreditCard } from 'lucide-react';

const PoliciesSection = () => {
    return (
        <div className="py-8 border-t border-slate-200 dark:border-white/10" id="policies">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Policies</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Check-in / Check-out */}
                <div className="space-y-6">
                    <div>
                        <div className="flex items-start gap-3 mb-2">
                            <Clock className="mt-1 text-slate-900 dark:text-white" size={20} />
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Check-in</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-300">Check-in start time: 2:00 PM; Check-in end time: midnight</p>
                                <p className="text-sm text-slate-600 dark:text-slate-300">Minimum check-in age: 18</p>
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="flex items-start gap-3 mb-2">
                            <Clock className="mt-1 text-slate-900 dark:text-white" size={20} />
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Check-out</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-300">Check-out before 12:00 PM</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Other Policies */}
                <div className="space-y-6">
                    <div>
                        <div className="flex items-start gap-3 mb-2">
                            <Baby className="mt-1 text-slate-900 dark:text-white" size={24} />
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Children and extra beds</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-300">Children are welcome.</p>
                                <p className="text-sm text-slate-600 dark:text-slate-300">Kids stay free! Children stay free when using existing bedding.</p>
                                <p className="text-sm text-slate-600 dark:text-slate-300">Rollaway/extra beds are available for PHP 1,500.0 per night.</p>
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="flex items-start gap-3 mb-2">
                            <PawPrint className="mt-1 text-slate-900 dark:text-white" size={20} />
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Pets</h3>
                                <p className="text-sm text-slate-600 dark:text-slate-300">Pets are allowed for an extra charge of PHP 1,000 per pet, per night.</p>
                                <p className="text-sm text-slate-600 dark:text-slate-300">Service animals are welcome, and are exempt from fees.</p>
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="flex items-start gap-3 mb-2">
                            <CreditCard className="mt-1 text-slate-900 dark:text-white" size={20} />
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Payment types</h3>
                                <div className="flex gap-2 mt-2">
                                    <div className="w-8 h-5 bg-slate-200 rounded"></div>
                                    <div className="w-8 h-5 bg-slate-200 rounded"></div>
                                    <div className="w-8 h-5 bg-slate-200 rounded"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-white/5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Important information</h3>
                <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-300 space-y-1">
                    <li>This property offers transfers from the airport (surcharges may apply).</li>
                    <li>Reservations are required for massage services and spa treatments.</li>
                    <li>One child 6 years old or younger stays free when occupying the parent or guardian's room, using existing bedding.</li>
                </ul>
            </div>
        </div>
    );
};

export default PoliciesSection;
