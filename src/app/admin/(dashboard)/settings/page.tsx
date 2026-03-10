"use client";

import React from 'react';
import { HeaderTitle } from '@/components/admin/HeaderTitle';
import { Settings, Bell, Shield, Globe, CreditCard, Save, Settings2, ShieldCheck } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { motion } from 'framer-motion';

export default function AdminSettingsPage() {
    return (
        <div className="space-y-10 pb-20">
            <HeaderTitle
                title="Settings"
                subtitle="Configure platform-wide preferences and security"
                actions={
                    <Button className="bg-blue-600 hover:bg-blue-500 rounded-xl font-bold h-12 px-6 shadow-xl shadow-blue-500/20 transition-all text-white border-0 gap-2">
                        <Save size={18} />
                        Save Changes
                    </Button>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Navigation / Sidebar */}
                <div className="lg:col-span-1 space-y-4">
                    {[
                        { icon: Settings2, label: 'General', description: 'Portal name, branding, and basic info', active: true },
                        { icon: ShieldCheck, label: 'Security', description: 'Authentication and access logs', active: false },
                        { icon: Bell, label: 'Notifications', description: 'System alerts and email templates', active: false },
                        { icon: Globe, label: 'Localization', description: 'Currency, timezone, and languages', active: false },
                    ].map((item, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={`p-6 rounded-xl border transition-all cursor-pointer group ${item.active
                                ? 'bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-500/20'
                                : 'bg-white dark:bg-obsidian border-slate-100 dark:border-white/10 hover:border-blue-500/30'
                                }`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-xl ${item.active ? 'bg-white/10' : 'bg-slate-100 dark:bg-white/5 text-slate-400 group-hover:text-blue-500'}`}>
                                    <item.icon size={20} />
                                </div>
                                <div>
                                    <h4 className="font-black tracking-tight">{item.label}</h4>
                                    <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${item.active ? 'text-blue-100' : 'text-slate-400'}`}>
                                        {item.description}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Settings Form */}
                <div className="lg:col-span-2 space-y-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-xl shadow-xl p-8"
                    >
                        <div className="flex items-center gap-4 mb-10">
                            <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
                            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">General Configuration</h3>
                        </div>

                        <div className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Portal Name</label>
                                    <Input
                                        defaultValue="K-Travel Platform"
                                        className="h-14 bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10 rounded-2xl px-6 font-bold"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Admin Email</label>
                                    <Input
                                        defaultValue="admin@k-travel.com"
                                        className="h-14 bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10 rounded-2xl px-6 font-bold"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Platform Description</label>
                                <textarea
                                    className="w-full min-h-[120px] bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10 rounded-2xl p-6 font-bold resize-none"
                                    defaultValue="Universal booking and distribution platform for Baguio City's premium travel services."
                                />
                            </div>

                            <div className="pt-6 border-t border-slate-100 dark:border-white/5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                                            <Globe size={20} />
                                        </div>
                                        <div>
                                            <h4 className="font-black tracking-tight">Public Registration</h4>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Allow new suppliers to sign up</p>
                                        </div>
                                    </div>
                                    <div className="w-12 h-6 bg-blue-600 rounded-full relative cursor-pointer shadow-inner shadow-blue-700/50">
                                        <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 p-8 rounded-xl shadow-xl"
                    >
                        <div className="flex items-center gap-4 mb-10">
                            <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
                            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Localization</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Default Currency</label>
                                <select className="w-full h-14 px-6 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 text-sm outline-none font-bold">
                                    <option>USD - US Dollar</option>
                                    <option>PHP - Philippine Peso</option>
                                    <option>EUR - Euro</option>
                                </select>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Timezone</label>
                                <select className="w-full h-14 px-6 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 text-sm outline-none font-bold">
                                    <option>UTC+8 - Asia/Manila</option>
                                    <option>UTC-5 - America/New_York</option>
                                    <option>UTC+1 - Europe/London</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-3 pt-8 border-t border-slate-100 dark:border-white/5 mt-8">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">API Cache Duration (minutes)</label>
                            <Input type="number" defaultValue="60" className="max-w-[120px] h-14 bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10 rounded-2xl px-6 font-bold" />
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white/50 dark:bg-obsidian/50 backdrop-blur-xl border border-white/20 dark:border-white/10 p-6 rounded-xl shadow-sm space-y-6"
                    >
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-white/5 pb-4 flex items-center gap-2">
                            <Shield size={18} className="text-blue-500" />
                            Integration Keys
                        </h3>
                        <div className="space-y-4">
                            {[
                                { label: 'LiteAPI Key', value: '••••••••••••••••••••' },
                                { label: 'Duffel Token', value: '••••••••••••••••••••' },
                                { label: 'Supabase URL', value: process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not Configured' }
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
                </div >
            </div >
        </div >
    );
}
