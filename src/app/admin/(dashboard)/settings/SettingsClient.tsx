"use client";

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Save,
    Settings2,
    ShieldCheck,
    Bell,
    Globe,
    Shield,
    CheckCircle2,
    AlertCircle,
    Loader2,
} from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { HeaderTitle } from '@/components/admin/HeaderTitle';
import { EXCHANGE_RATES } from '@/lib/currency';
import type { IntegrationKey } from '@/lib/server/admin/settings';

interface SettingsClientProps {
    initialSettings: Record<string, any>;
    integrationKeys: IntegrationKey[];
}

const TABS = [
    { id: 'general', icon: Settings2, label: 'General', description: 'Portal name, branding, and basic info' },
    { id: 'security', icon: ShieldCheck, label: 'Security', description: 'Integration keys and access info' },
    { id: 'notifications', icon: Bell, label: 'Notifications', description: 'System alerts and preferences' },
    { id: 'localization', icon: Globe, label: 'Localization', description: 'Currency, timezone, and cache' },
] as const;

type TabId = typeof TABS[number]['id'];

const TIMEZONES = [
    { value: 'Asia/Manila', label: 'UTC+8 — Asia/Manila' },
    { value: 'Asia/Tokyo', label: 'UTC+9 — Asia/Tokyo' },
    { value: 'Asia/Seoul', label: 'UTC+9 — Asia/Seoul' },
    { value: 'Asia/Singapore', label: 'UTC+8 — Asia/Singapore' },
    { value: 'America/New_York', label: 'UTC-5 — America/New_York' },
    { value: 'America/Los_Angeles', label: 'UTC-8 — America/Los_Angeles' },
    { value: 'Europe/London', label: 'UTC+0 — Europe/London' },
    { value: 'Europe/Paris', label: 'UTC+1 — Europe/Paris' },
    { value: 'Australia/Sydney', label: 'UTC+11 — Australia/Sydney' },
];

const CURRENCIES = Object.keys(EXCHANGE_RATES);

export function SettingsClient({ initialSettings, integrationKeys }: SettingsClientProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabId>('general');
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Track the "saved" baseline so isDirty resets after successful save
    const savedBaseline = useRef(initialSettings);

    // Form state
    const [portalName, setPortalName] = useState(initialSettings.portal_name || '');
    const [adminEmail, setAdminEmail] = useState(initialSettings.admin_email || '');
    const [description, setDescription] = useState(initialSettings.platform_description || '');
    const [publicRegistration, setPublicRegistration] = useState(initialSettings.public_registration ?? true);
    const [currency, setCurrency] = useState(initialSettings.default_currency || 'USD');
    const [timezone, setTimezone] = useState(initialSettings.timezone || 'Asia/Manila');
    const [cacheDuration, setCacheDuration] = useState(initialSettings.cache_duration ?? 60);

    const baseline = savedBaseline.current;
    const isDirty =
        portalName !== (baseline.portal_name || '') ||
        adminEmail !== (baseline.admin_email || '') ||
        description !== (baseline.platform_description || '') ||
        publicRegistration !== (baseline.public_registration ?? true) ||
        currency !== (baseline.default_currency || 'USD') ||
        timezone !== (baseline.timezone || 'Asia/Manila') ||
        cacheDuration !== (baseline.cache_duration ?? 60);

    const handleSave = async () => {
        setSaving(true);
        setToast(null);
        try {
            const res = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    settings: {
                        portal_name: portalName,
                        admin_email: adminEmail,
                        platform_description: description,
                        public_registration: publicRegistration,
                        default_currency: currency,
                        timezone: timezone,
                        cache_duration: cacheDuration,
                    },
                }),
            });
            const data = await res.json();
            if (data.success) {
                // Update baseline so isDirty resets
                savedBaseline.current = {
                    portal_name: portalName,
                    admin_email: adminEmail,
                    platform_description: description,
                    public_registration: publicRegistration,
                    default_currency: currency,
                    timezone: timezone,
                    cache_duration: cacheDuration,
                };
                setToast({ type: 'success', message: 'Settings saved successfully' });
                // Refresh server data so other pages pick up changes immediately
                router.refresh();
            } else {
                setToast({ type: 'error', message: data.error || 'Failed to save' });
            }
        } catch {
            setToast({ type: 'error', message: 'Network error' });
        } finally {
            setSaving(false);
            setTimeout(() => setToast(null), 4000);
        }
    };

    return (
        <div className="space-y-10 pb-20">
            <HeaderTitle />

            {/* Toast */}
            {toast && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-bold ${
                        toast.type === 'success'
                            ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                    }`}
                >
                    {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                    {toast.message}
                </motion.div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Sidebar Tabs */}
                <div className="lg:col-span-1 space-y-4">
                    {TABS.map((tab, i) => (
                        <motion.div
                            key={tab.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            onClick={() => setActiveTab(tab.id)}
                            className={`p-6 rounded-xl border transition-all cursor-pointer group ${
                                activeTab === tab.id
                                    ? 'bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-500/20'
                                    : 'bg-white dark:bg-obsidian border-slate-100 dark:border-white/10 hover:border-blue-500/30'
                            }`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-xl ${
                                    activeTab === tab.id
                                        ? 'bg-white/10'
                                        : 'bg-slate-100 dark:bg-white/5 text-slate-400 group-hover:text-blue-500'
                                }`}>
                                    <tab.icon size={20} />
                                </div>
                                <div>
                                    <h4 className="font-black tracking-tight">{tab.label}</h4>
                                    <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${
                                        activeTab === tab.id ? 'text-blue-100' : 'text-slate-400'
                                    }`}>
                                        {tab.description}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="lg:col-span-2 space-y-8">
                    {/* General */}
                    {activeTab === 'general' && (
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
                                            value={portalName}
                                            onChange={e => setPortalName(e.target.value)}
                                            className="h-14 bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10 rounded-2xl px-6 font-bold"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Admin Email</label>
                                        <Input
                                            value={adminEmail}
                                            onChange={e => setAdminEmail(e.target.value)}
                                            className="h-14 bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10 rounded-2xl px-6 font-bold"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Platform Description</label>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        className="w-full min-h-[120px] bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-2xl p-6 font-bold resize-none text-slate-900 dark:text-white"
                                    />
                                </div>

                                <div className="pt-6 border-t border-slate-100 dark:border-white/5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                                                <Globe size={20} />
                                            </div>
                                            <div>
                                                <h4 className="font-black tracking-tight text-slate-900 dark:text-white">Public Registration</h4>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Allow new users to sign up</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setPublicRegistration((prev: boolean) => !prev)}
                                            className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors shadow-inner ${
                                                publicRegistration ? 'bg-blue-600 shadow-blue-700/50' : 'bg-slate-300 dark:bg-white/10'
                                            }`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                                                publicRegistration ? 'right-1' : 'left-1'
                                            }`} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Security */}
                    {activeTab === 'security' && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 p-8 rounded-xl shadow-xl"
                        >
                            <div className="flex items-center gap-4 mb-10">
                                <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
                                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Integration Keys</h3>
                            </div>

                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-6">
                                API keys and secrets are configured via environment variables. Values shown below are masked for security.
                            </p>

                            <div className="space-y-4">
                                {integrationKeys.map((key, i) => (
                                    <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{key.label}</p>
                                            <p className="text-xs font-mono text-slate-900 dark:text-white truncate mt-1">{key.masked}</p>
                                        </div>
                                        <div className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                                            key.configured
                                                ? 'bg-emerald-500/10 text-emerald-500'
                                                : 'bg-rose-500/10 text-rose-500'
                                        }`}>
                                            {key.configured ? 'Active' : 'Missing'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* Notifications */}
                    {activeTab === 'notifications' && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 p-8 rounded-xl shadow-xl"
                        >
                            <div className="flex items-center gap-4 mb-10">
                                <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
                                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Notification Preferences</h3>
                            </div>

                            <div className="space-y-6">
                                {[
                                    { label: 'Booking Confirmations', desc: 'Notify on new bookings', enabled: true },
                                    { label: 'Cancellation Alerts', desc: 'Notify on booking cancellations', enabled: true },
                                    { label: 'System Errors', desc: 'Notify on API failures and errors', enabled: true },
                                    { label: 'User Signups', desc: 'Notify when new users register', enabled: false },
                                ].map((pref, i) => (
                                    <div key={i} className="flex items-center justify-between py-4 border-b border-slate-100 dark:border-white/5 last:border-0">
                                        <div>
                                            <h4 className="font-black tracking-tight text-slate-900 dark:text-white text-sm">{pref.label}</h4>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{pref.desc}</p>
                                        </div>
                                        <div className={`w-12 h-6 rounded-full relative shadow-inner ${
                                            pref.enabled ? 'bg-blue-600 shadow-blue-700/50' : 'bg-slate-300 dark:bg-white/10'
                                        }`}>
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full ${
                                                pref.enabled ? 'right-1' : 'left-1'
                                            }`} />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-8">
                                Notification preferences will be configurable in a future update.
                            </p>
                        </motion.div>
                    )}

                    {/* Localization */}
                    {activeTab === 'localization' && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 p-8 rounded-xl shadow-xl"
                        >
                            <div className="flex items-center gap-4 mb-10">
                                <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
                                <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Localization</h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Default Currency</label>
                                    <select
                                        value={currency}
                                        onChange={e => setCurrency(e.target.value)}
                                        className="w-full h-14 px-6 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 text-sm outline-none font-bold text-slate-900 dark:text-white"
                                    >
                                        {CURRENCIES.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Timezone</label>
                                    <select
                                        value={timezone}
                                        onChange={e => setTimezone(e.target.value)}
                                        className="w-full h-14 px-6 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 text-sm outline-none font-bold text-slate-900 dark:text-white"
                                    >
                                        {TIMEZONES.map(tz => (
                                            <option key={tz.value} value={tz.value}>{tz.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-3 pt-8 border-t border-slate-100 dark:border-white/5 mt-8">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">API Cache Duration (minutes)</label>
                                <Input
                                    type="number"
                                    value={cacheDuration}
                                    onChange={e => setCacheDuration(Number(e.target.value))}
                                    className="max-w-[120px] h-14 bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10 rounded-2xl px-6 font-bold"
                                />
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>

            {/* Sticky Save Bar */}
            <AnimatePresence>
                {isDirty && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="sticky bottom-6 z-40 flex items-center justify-between gap-4 bg-white dark:bg-obsidian border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-4 shadow-2xl shadow-black/10"
                    >
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">You have unsaved changes</p>
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl font-bold h-12 px-6 shadow-xl shadow-blue-500/20 transition-all text-white border-0 gap-2"
                        >
                            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            {saving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
