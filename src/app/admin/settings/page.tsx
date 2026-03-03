"use client";

import React from 'react';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Settings, Bell, Shield, Globe, CreditCard, Save } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { motion } from 'framer-motion';

export default function AdminSettingsPage() {
    return (
        <div className="space-y-6 sm:space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <SectionHeader
                    title="Platform Settings"
                    subtitle="Configure platform-wide settings and preferences."
                    size="lg"
                    icon={Settings}
                />
                <Button size="sm" leftIcon={<Save size={16} />}>
                    Save Changes
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Navigation */}
                <div className="lg:col-span-1 space-y-2">
                    {[
                        { icon: Globe, label: 'General Settings', active: true },
                        { icon: Bell, label: 'Notifications', active: false },
                        { icon: Shield, label: 'Security & Access', active: false },
                        { icon: CreditCard, label: 'Payment Providers', active: false },
                    ].map((item, i) => (
                        <button
                            key={i}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${item.active
                                    ? 'bg-blue-600 text-white shadow-lg'
                                    : 'bg-white/50 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-white/10'
                                }`}
                        >
                            <item.icon size={18} />
                            <span className="font-medium text-sm">{item.label}</span>
                        </button>
                    ))}
                </div>

                {/* Form Area */}
                <div className="lg:col-span-2 space-y-6">
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="bg-white/50 dark:bg-obsidian/50 backdrop-blur-xl border border-white/20 dark:border-white/10 p-6 rounded-2xl shadow-sm space-y-6"
                    >
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-white/5 pb-4">General Configuration</h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Platform Name</label>
                                <Input defaultValue="CheapestGo" className="bg-white/50 dark:bg-white/5 border-white/20 dark:border-white/10" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Support Email</label>
                                <Input defaultValue="support@cheapestgo.com" className="bg-white/50 dark:bg-white/5 border-white/20 dark:border-white/10" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Default Currency</label>
                                <select className="w-full h-10 px-3 rounded-xl bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10 text-sm outline-none">
                                    <option>USD - US Dollar</option>
                                    <option>PHP - Philippine Peso</option>
                                    <option>EUR - Euro</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Maintenance Mode</label>
                                <div className="flex items-center h-10 px-3 rounded-xl bg-white/50 dark:bg-white/5 border border-white/20 dark:border-white/10">
                                    <span className="text-xs text-rose-500 font-bold">DISABLED</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 pt-4">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">API Cache Duration (minutes)</label>
                            <Input type="number" defaultValue="60" className="max-w-[120px] bg-white/50 dark:bg-white/5 border-white/20 dark:border-white/10" />
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white/50 dark:bg-obsidian/50 backdrop-blur-xl border border-white/20 dark:border-white/10 p-6 rounded-2xl shadow-sm space-y-6"
                    >
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-white/5 pb-4 flex items-center gap-2">
                            <Shield size={18} className="text-blue-500" />
                            Integration Keys
                        </h3>
                        <div className="space-y-4">
                            {[
                                { label: 'LiteAPI Key', value: '••••••••••••••••••••' },
                                { label: 'Duffel Token', value: '••••••••••••••••••••' },
                                { label: 'Supabase URL', value: 'https://cheapest-go.supabase.co' }
                            ].map((row, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-white/5">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">{row.label}</p>
                                        <p className="text-xs font-mono text-slate-900 dark:text-white">{row.value}</p>
                                    </div>
                                    <Button variant="ghost" size="sm" className="h-7 text-[10px]">Reveal</Button>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
