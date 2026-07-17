"use client";

import React, { useState, useEffect } from 'react';
import { User, Lock, Bell, Loader2, Check, Eye, EyeOff, HelpCircle, MessageCircle, Mail } from 'lucide-react';
import type { User as UserType } from '@/types/auth';
import { useAuthStore } from '@/stores/authStore';
import { clientFetch } from '@/lib/api/client';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface AccountMainContentProps {
    user: UserType;
    activeSection?: string;
}

export const AccountMainContent: React.FC<AccountMainContentProps> = ({ user, activeSection = 'profile' }) => {
    const { updateProfile, updatePassword } = useAuthStore();
    const t = useTranslations('account');

    // Profile form state
    const [firstName, setFirstName] = useState(user.firstName || '');
    const [lastName, setLastName] = useState(user.lastName || '');
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [profileSaving, setProfileSaving] = useState(false);

    // Password form state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [passwordSaving, setPasswordSaving] = useState(false);

    // Notification state
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [marketingEmails, setMarketingEmails] = useState(false);
    const [tripReminders, setTripReminders] = useState(true);

    useEffect(() => {
        setFirstName(user.firstName || '');
        setLastName(user.lastName || '');
    }, [user]);

    // Load saved notification preferences so they persist across navigation
    // (previously these reset to defaults every mount and the Save button was a
    // no-op, so nothing survived a trip to the homepage and back).
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await clientFetch('/api/preferences');
                if (!res.ok) return;
                const { preferences } = await res.json();
                if (cancelled || !preferences) return;
                if (typeof preferences.emailNotifications === 'boolean') setEmailNotifications(preferences.emailNotifications);
                if (typeof preferences.marketingEmails === 'boolean') setMarketingEmails(preferences.marketingEmails);
                if (typeof preferences.tripReminders === 'boolean') setTripReminders(preferences.tripReminders);
            } catch {
                // keep defaults
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Notification toggles auto-save the moment they're flipped — optimistic,
    // reverting the switch if the request fails.
    const updatePreference = async (
        key: 'emailNotifications' | 'marketingEmails' | 'tripReminders',
        value: boolean,
        setLocal: (v: boolean) => void,
    ) => {
        setLocal(value);
        try {
            const res = await clientFetch('/api/preferences', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: value }),
            });
            if (!res.ok) throw new Error();
            toast.success(t('communications.preferencesSaved'));
        } catch {
            setLocal(!value); // revert on failure
            toast.error(t('communications.preferencesSaveError'));
        }
    };

    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firstName.trim() || !lastName.trim()) {
            toast.error(t('profile.fillAllFields'));
            return;
        }

        setProfileSaving(true);
        try {
            await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() });
            toast.success(t('profile.updateSuccess'));
            setIsEditingProfile(false);
        } catch (error: any) {
            toast.error(error.message || t('profile.updateError'));
        } finally {
            setProfileSaving(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!currentPassword || !newPassword || !confirmPassword) {
            toast.error(t('security.fillAllPasswordFields'));
            return;
        }

        if (newPassword.length < 6) {
            toast.error(t('security.passwordTooShort'));
            return;
        }

        if (newPassword !== confirmPassword) {
            toast.error(t('security.passwordsDoNotMatch'));
            return;
        }

        setPasswordSaving(true);
        try {
            await updatePassword(currentPassword, newPassword);
            toast.success(t('security.passwordUpdateSuccess'));
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            toast.error(error.message || t('security.passwordUpdateError'));
        } finally {
            setPasswordSaving(false);
        }
    };

    // Security Section Content
    if (activeSection === 'security') {
        return (
            <div className="flex-1 min-w-0">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 p-6 lg:p-8">
                    <h2 className="text-[clamp(1.125rem,4vw,1.5rem)] font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
                        <Lock className="w-6 h-6 text-blue-600" />
                        {t('security.heading')}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-8">
                        {t('security.subheading')}
                    </p>

                    <section className="mb-8">
                        <h3 className="text-[clamp(0.9375rem,2vw,1.125rem)] font-semibold text-slate-900 dark:text-white mb-4">{t('security.changePassword')}</h3>

                        <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    {t('security.currentPassword')}
                                </label>
                                <div className="relative">
                                    <input
                                        type={showCurrentPassword ? 'text' : 'password'}
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="w-full px-4 py-3 pr-12 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    {t('security.newPassword')}
                                </label>
                                <div className="relative">
                                    <input
                                        type={showNewPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full px-4 py-3 pr-12 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">{t('security.newPasswordHint')}</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    {t('security.confirmPassword')}
                                </label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="pt-4">
                                <button
                                    type="submit"
                                    disabled={passwordSaving}
                                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                                >
                                    {passwordSaving ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {t('security.updating')}
                                        </>
                                    ) : (
                                        <>
                                            <Lock className="w-4 h-4" />
                                            {t('security.updatePassword')}
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </section>

                    <hr className="border-slate-200 dark:border-white/10 my-8" />

                    <section>
                        <h3 className="text-[clamp(0.9375rem,2vw,1.125rem)] font-semibold text-slate-900 dark:text-white mb-2">{t('security.accountEmail')}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                            {t('security.accountEmailSubtitle')}
                        </p>
                        <div className="bg-slate-50 dark:bg-white/5 rounded-lg p-4 border border-slate-200 dark:border-white/10">
                            <p className="font-medium text-slate-900 dark:text-white">{user.email}</p>
                            <p className="text-xs text-slate-500 mt-1">{t('security.emailCannotChange')}</p>
                        </div>
                    </section>
                </div>
            </div>
        );
    }

    // Communications Section Content
    if (activeSection === 'communications') {
        return (
            <div className="flex-1 min-w-0">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 p-6 lg:p-8">
                    <h2 className="text-[clamp(1.125rem,4vw,1.5rem)] font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
                        <Bell className="w-6 h-6 text-blue-600" />
                        {t('communications.heading')}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-8">
                        {t('communications.subheading')}
                    </p>

                    <div className="space-y-6">
                        <label className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                            <div>
                                <p className="font-medium text-slate-900 dark:text-white">{t('communications.emailNotifications')}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('communications.emailNotificationsDesc')}</p>
                            </div>
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    checked={emailNotifications}
                                    onChange={(e) => updatePreference('emailNotifications', e.target.checked, setEmailNotifications)}
                                    className="sr-only"
                                />
                                <div className={`flex items-center w-11 h-6 rounded-full px-0.5 transition-colors ${emailNotifications ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${emailNotifications ? 'translate-x-5' : 'translate-x-0'}`} />
                                </div>
                            </div>
                        </label>

                        <label className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                            <div>
                                <p className="font-medium text-slate-900 dark:text-white">{t('communications.tripReminders')}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('communications.tripRemindersDesc')}</p>
                            </div>
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    checked={tripReminders}
                                    onChange={(e) => updatePreference('tripReminders', e.target.checked, setTripReminders)}
                                    className="sr-only"
                                />
                                <div className={`flex items-center w-11 h-6 rounded-full px-0.5 transition-colors ${tripReminders ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${tripReminders ? 'translate-x-5' : 'translate-x-0'}`} />
                                </div>
                            </div>
                        </label>

                        <label className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                            <div>
                                <p className="font-medium text-slate-900 dark:text-white">{t('communications.marketingEmails')}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('communications.marketingEmailsDesc')}</p>
                            </div>
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    checked={marketingEmails}
                                    onChange={(e) => updatePreference('marketingEmails', e.target.checked, setMarketingEmails)}
                                    className="sr-only"
                                />
                                <div className={`flex items-center w-11 h-6 rounded-full px-0.5 transition-colors ${marketingEmails ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${marketingEmails ? 'translate-x-5' : 'translate-x-0'}`} />
                                </div>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
        );
    }

    // Help Section Content
    if (activeSection === 'help') {
        return (
            <div className="flex-1 min-w-0">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 p-6 lg:p-8">
                    <h2 className="text-[clamp(1.125rem,4vw,1.5rem)] font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
                        <HelpCircle className="w-6 h-6 text-blue-600" />
                        {t('help.heading')}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-8">
                        {t('help.subheading')}
                    </p>

                    <div className="space-y-4">
                        <a
                            href="mailto:support@cheapestgo.com"
                            className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-white/5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                        >
                            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                                <p className="font-medium text-slate-900 dark:text-white">{t('help.emailSupport')}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('help.emailSupportAddress')}</p>
                            </div>
                        </a>

                        <a
                            href="#"
                            className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-white/5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                        >
                            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                <MessageCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                                <p className="font-medium text-slate-900 dark:text-white">{t('help.liveChat')}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('help.liveChatDesc')}</p>
                            </div>
                        </a>

                        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
                            <h3 className="font-medium text-slate-900 dark:text-white mb-2">{t('help.faqTitle')}</h3>
                            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-600">•</span>
                                    {t('help.faq1')}
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-600">•</span>
                                    {t('help.faq2')}
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-600">•</span>
                                    {t('help.faq3')}
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-600">•</span>
                                    {t('help.faq4')}
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Default: Profile Section Content
    return (
        <div className="flex-1 min-w-0">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-white/10 p-6 lg:p-8">
                {/* User Name Header */}
                <h2 className="text-[clamp(1.125rem,4vw,1.5rem)] font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
                    <User className="w-6 h-6 text-blue-600" />
                    {t('profile.heading')}
                </h2>
                <p className="text-slate-500 dark:text-slate-400 mb-8">
                    {t('profile.subheading')}
                </p>

                {/* Basic Information Section */}
                <section>
                    {isEditingProfile ? (
                        <form onSubmit={handleProfileSubmit} className="space-y-4 max-w-md">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        {t('profile.firstName')}
                                    </label>
                                    <input
                                        type="text"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        {t('profile.lastName')}
                                    </label>
                                    <input
                                        type="text"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    disabled={profileSaving}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                                >
                                    {profileSaving ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {t('profile.saving')}
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            {t('profile.save')}
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsEditingProfile(false);
                                        setFirstName(user.firstName || '');
                                        setLastName(user.lastName || '');
                                    }}
                                    className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium transition-colors"
                                >
                                    {t('profile.cancel')}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-xl">
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('profile.fullName')}</p>
                                    <p className="font-medium text-slate-900 dark:text-white">{user.firstName} {user.lastName}</p>
                                </div>
                                <button
                                    onClick={() => setIsEditingProfile(true)}
                                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                                >
                                    {t('profile.edit')}
                                </button>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-xl">
                                <p className="text-sm text-slate-500 dark:text-slate-400">{t('profile.emailAddress')}</p>
                                <p className="font-medium text-slate-900 dark:text-white">{user.email}</p>
                                <p className="text-xs text-slate-400 mt-1">{t('profile.emailCannotChange')}</p>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};
