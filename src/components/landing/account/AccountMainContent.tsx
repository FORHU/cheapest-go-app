"use client";

import React from 'react';
import { Shield, FileText, Settings, Star, Users } from 'lucide-react';
import { User } from '@/components/auth';
import { AccountSectionHeader } from './AccountSectionHeader';
import { AccountInfoRow } from './AccountInfoRow';
import { AccountDetailCard } from './AccountDetailCard';

interface AccountMainContentProps {
    user: User;
}

export const AccountMainContent: React.FC<AccountMainContentProps> = ({ user }) => {
    return (
        <div className="flex-1 min-w-0">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 p-6 lg:p-8">
                {/* User Name Header */}
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-8">
                    {user.firstName} {user.lastName}
                </h2>

                {/* Basic Information Section */}
                <section className="mb-8">
                    <AccountSectionHeader
                        title="Basic information"
                        description="Make sure this information matches your travel ID, like your passport or license."
                        onEdit={() => { }}
                    />

                    <div className="grid grid-cols-2 gap-6">
                        <AccountInfoRow label="Name" value={`${user.firstName} ${user.lastName}`} />
                        <AccountInfoRow label="Bio" value="Not provided" />
                        <AccountInfoRow label="Date of birth" value="Not provided" />
                        <AccountInfoRow label="Gender" value="Not provided" />
                        <AccountInfoRow label="Accessibility needs" value="Not provided" />
                    </div>
                </section>

                <hr className="border-slate-200 dark:border-white/10 my-8" />

                {/* Contact Section */}
                <section className="mb-8">
                    <AccountSectionHeader
                        title="Contact"
                        description="Receive account activity alerts and trip updates by sharing this information."
                        onEdit={() => { }}
                    />

                    <div className="grid grid-cols-2 gap-6">
                        <AccountInfoRow label="Mobile number" value="Not provided" />
                        <AccountInfoRow label="Email" value={user.email} />
                        <AccountInfoRow label="Emergency contact" value="Not provided" />
                        <AccountInfoRow label="Address" value="Not provided" />
                    </div>
                </section>

                <hr className="border-slate-200 dark:border-white/10 my-8" />

                {/* Bottom Section - Two Columns */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* More Details */}
                    <section>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">More details</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                            Speed up your booking by securely saving essential travel details.
                        </p>

                        <div className="space-y-3">
                            <AccountDetailCard
                                icon={<Shield size={20} />}
                                title="Airport security"
                                description="TSA PreCheck and Redress number"
                            />
                            <AccountDetailCard
                                icon={<FileText size={20} />}
                                title="Travel documents"
                                description="Passport"
                            />
                            <AccountDetailCard
                                icon={<Settings size={20} />}
                                title="Flight preferences"
                                description="Seat preference and home airport"
                            />
                            <AccountDetailCard
                                icon={<Star size={20} />}
                                title="Reward programs"
                                description="Frequent flyer and membership programs"
                            />
                        </div>
                    </section>

                    {/* Additional Travelers */}
                    <section>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Additional travelers</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                            Make booking a breeze by saving profiles of family, friends, or teammates who often travel with you.
                        </p>

                        <button className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-dashed border-slate-300 dark:border-white/20 rounded-xl text-slate-600 dark:text-slate-300 hover:border-blue-400 dark:hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                            <Users size={20} />
                            Add additional traveler
                        </button>
                    </section>
                </div>
            </div>
        </div>
    );
};
