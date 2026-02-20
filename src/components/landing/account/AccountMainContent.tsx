"use client";

import React, { useState, useEffect } from 'react';
import { User, Lock, Bell, Loader2, Check, Eye, EyeOff, HelpCircle, MessageCircle, Mail } from 'lucide-react';
import type { User as UserType } from '@/types/auth';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';

interface AccountMainContentProps {
    user: UserType;
    activeSection?: string;
}

export const AccountMainContent: React.FC<AccountMainContentProps> = ({ user, activeSection = 'profile' }) => {
    const { updateProfile, updatePassword } = useAuthStore();

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

    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!firstName.trim() || !lastName.trim()) {
            toast.error('Please fill in all fields');
            return;
        }

        setProfileSaving(true);
        try {
            await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim() });
            toast.success('Profile updated successfully');
            setIsEditingProfile(false);
        } catch (error: any) {
            toast.error(error.message || 'Failed to update profile');
        } finally {
            setProfileSaving(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!currentPassword || !newPassword || !confirmPassword) {
            toast.error('Please fill in all password fields');
            return;
        }

        if (newPassword.length < 6) {
            toast.error('New password must be at least 6 characters');
            return;
        }

        if (newPassword !== confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }

        setPasswordSaving(true);
        try {
            await updatePassword(currentPassword, newPassword);
            toast.success('Password updated successfully');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            toast.error(error.message || 'Failed to update password');
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
                        Security Settings
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-8">
                        Manage your password and account security
                    </p>

                    <section className="mb-8">
                        <h3 className="text-[clamp(0.9375rem,2vw,1.125rem)] font-semibold text-slate-900 dark:text-white mb-4">Change Password</h3>

                        <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Current Password
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
                                    New Password
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
                                <p className="text-xs text-slate-500 mt-1">Minimum 6 characters</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Confirm New Password
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
                                            Updating...
                                        </>
                                    ) : (
                                        <>
                                            <Lock className="w-4 h-4" />
                                            Update Password
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </section>

                    <hr className="border-slate-200 dark:border-white/10 my-8" />

                    <section>
                        <h3 className="text-[clamp(0.9375rem,2vw,1.125rem)] font-semibold text-slate-900 dark:text-white mb-2">Account Email</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                            Your account email address
                        </p>
                        <div className="bg-slate-50 dark:bg-white/5 rounded-lg p-4 border border-slate-200 dark:border-white/10">
                            <p className="font-medium text-slate-900 dark:text-white">{user.email}</p>
                            <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
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
                        Communication Preferences
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-8">
                        Control which notifications and emails you receive
                    </p>

                    <div className="space-y-6">
                        <label className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                            <div>
                                <p className="font-medium text-slate-900 dark:text-white">Email Notifications</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Receive booking confirmations and updates</p>
                            </div>
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    checked={emailNotifications}
                                    onChange={(e) => setEmailNotifications(e.target.checked)}
                                    className="sr-only"
                                />
                                <div className={`w-11 h-6 rounded-full transition-colors ${emailNotifications ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${emailNotifications ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
                                </div>
                            </div>
                        </label>

                        <label className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                            <div>
                                <p className="font-medium text-slate-900 dark:text-white">Trip Reminders</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Get reminders before your upcoming trips</p>
                            </div>
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    checked={tripReminders}
                                    onChange={(e) => setTripReminders(e.target.checked)}
                                    className="sr-only"
                                />
                                <div className={`w-11 h-6 rounded-full transition-colors ${tripReminders ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${tripReminders ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
                                </div>
                            </div>
                        </label>

                        <label className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
                            <div>
                                <p className="font-medium text-slate-900 dark:text-white">Marketing Emails</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Receive deals, promotions, and travel tips</p>
                            </div>
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    checked={marketingEmails}
                                    onChange={(e) => setMarketingEmails(e.target.checked)}
                                    className="sr-only"
                                />
                                <div className={`w-11 h-6 rounded-full transition-colors ${marketingEmails ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${marketingEmails ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
                                </div>
                            </div>
                        </label>
                    </div>

                    <div className="mt-8">
                        <button
                            onClick={() => toast.success('Preferences saved')}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                            <Check className="w-4 h-4" />
                            Save Preferences
                        </button>
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
                        Help & Support
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-8">
                        Get help with your account and bookings
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
                                <p className="font-medium text-slate-900 dark:text-white">Email Support</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">support@cheapestgo.com</p>
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
                                <p className="font-medium text-slate-900 dark:text-white">Live Chat</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Chat with our support team</p>
                            </div>
                        </a>

                        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
                            <h3 className="font-medium text-slate-900 dark:text-white mb-2">Frequently Asked Questions</h3>
                            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-600">•</span>
                                    How do I cancel or modify my booking?
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-600">•</span>
                                    When will I receive my booking confirmation?
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-600">•</span>
                                    How do I request a refund?
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-600">•</span>
                                    What payment methods are accepted?
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
                    Profile Information
                </h2>
                <p className="text-slate-500 dark:text-slate-400 mb-8">
                    Manage your personal information
                </p>

                {/* Basic Information Section */}
                <section>
                    {isEditingProfile ? (
                        <form onSubmit={handleProfileSubmit} className="space-y-4 max-w-md">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        First Name
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
                                        Last Name
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
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            Save
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
                                    Cancel
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-xl">
                                <div>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">Full Name</p>
                                    <p className="font-medium text-slate-900 dark:text-white">{user.firstName} {user.lastName}</p>
                                </div>
                                <button
                                    onClick={() => setIsEditingProfile(true)}
                                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                                >
                                    Edit
                                </button>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-xl">
                                <p className="text-sm text-slate-500 dark:text-slate-400">Email Address</p>
                                <p className="font-medium text-slate-900 dark:text-white">{user.email}</p>
                                <p className="text-xs text-slate-400 mt-1">Email cannot be changed</p>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};
