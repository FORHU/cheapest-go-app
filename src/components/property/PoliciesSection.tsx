"use client";

import React from 'react';
import { Clock, Baby, PawPrint, CreditCard } from 'lucide-react';

interface PoliciesSectionProps {
    checkInTime?: string;
    checkOutTime?: string;
    petPolicy?: string;
    childPolicy?: string;
}

const PoliciesSection: React.FC<PoliciesSectionProps> = ({
    checkInTime,
    checkOutTime,
    petPolicy,
    childPolicy
}) => {
    // If no policy data is available at all, don't render the section
    const hasAnyData = checkInTime || checkOutTime || petPolicy || childPolicy;

    if (!hasAnyData) {
        return null;
    }

    return (
        <div className="py-8 border-t border-slate-200 dark:border-white/10" id="policies">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Policies</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Check-in / Check-out */}
                {(checkInTime || checkOutTime) && (
                    <div className="space-y-6">
                        {checkInTime && (
                            <div>
                                <div className="flex items-start gap-3 mb-2">
                                    <Clock className="mt-1 text-slate-900 dark:text-white" size={20} />
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Check-in</h3>
                                        <p className="text-sm text-slate-600 dark:text-slate-300">{checkInTime}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        {checkOutTime && (
                            <div>
                                <div className="flex items-start gap-3 mb-2">
                                    <Clock className="mt-1 text-slate-900 dark:text-white" size={20} />
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Check-out</h3>
                                        <p className="text-sm text-slate-600 dark:text-slate-300">{checkOutTime}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Other Policies */}
                {(childPolicy || petPolicy) && (
                    <div className="space-y-6">
                        {childPolicy && (
                            <div>
                                <div className="flex items-start gap-3 mb-2">
                                    <Baby className="mt-1 text-slate-900 dark:text-white" size={24} />
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Children</h3>
                                        <p className="text-sm text-slate-600 dark:text-slate-300">{childPolicy}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        {petPolicy && (
                            <div>
                                <div className="flex items-start gap-3 mb-2">
                                    <PawPrint className="mt-1 text-slate-900 dark:text-white" size={20} />
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Pets</h3>
                                        <p className="text-sm text-slate-600 dark:text-slate-300">{petPolicy}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PoliciesSection;
