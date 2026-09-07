"use client";

import { ROLES, roleLabel, type Role } from '@/lib/auth/roles';
import React, { useState, useMemo } from 'react';

import { StatCard } from '@/components/admin/StatCard';
import { Users, Shield, Search, UserCheck, Clock, X, ShieldAlert, ShieldOff, Headset } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Badge,
    Button,
    Input
} from '@/components/ui';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@/components/ui/Dialog';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { AdminUserRecord } from '@/lib/server/admin/users';

/**
 * What the confirmation says, keyed on the role being given rather than the one being
 * taken away.
 *
 * With two roles the screen could call every change a promotion or a demotion and be
 * right. With three it cannot: making somebody a Support Agent is neither, and a button
 * reading "Promote to Admin" that hands out the Support Desk instead is a lie the
 * administrator only finds out about afterwards.
 */
const ROLE_CHANGE_COPY: Record<Role, { title: string; description: string; confirm: string }> = {
    admin: {
        title: 'Make Administrator',
        description:
            "This user will get the full back office — bookings, revenue, Stripe, settings, every customer's data — and the Support Desk along with it.",
        confirm: 'Make Administrator',
    },
    support_agent: {
        title: 'Make Support Agent',
        description:
            'This user will get the Support Desk: the customer conversations waiting there and the support hours. Nothing else in the admin opens for them.',
        confirm: 'Make Support Agent',
    },
    user: {
        title: 'Make Standard User',
        description:
            'This user will lose their staff access. Both the admin and the Support Desk will be closed to them.',
        confirm: 'Make Standard User',
    },
};

/** 'all' first, then the roles themselves, so the filter can never fall behind ROLES. */
const ROLE_FILTERS = ['all', ...ROLES] as const;

interface UsersManagementClientProps {
    initialUsers: AdminUserRecord[];
}

export function UsersManagementClient({ initialUsers }: UsersManagementClientProps) {
    const [users, setUsers] = useState(initialUsers);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
    const [loadingUserId, setLoadingUserId] = useState<string | null>(null);
    const [confirmTarget, setConfirmTarget] = useState<{ userId: string; currentRole: Role; newRole: Role } | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            const matchesSearch =
                user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                user.email.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesRole = roleFilter === 'all' || user.role === roleFilter;
            return matchesSearch && matchesRole;
        });
    }, [searchTerm, roleFilter, users]);

    const totalAdmins = useMemo(() => users.filter(u => u.role === 'admin').length, [users]);

    const totalAgents = useMemo(() => users.filter(u => u.role === 'support_agent').length, [users]);

    const recentSignups = useMemo(() => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return users.filter(u => new Date(u.createdAt) >= thirtyDaysAgo).length;
    }, [users]);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleRoleChange = async () => {
        if (!confirmTarget) return;
        const { userId, newRole } = confirmTarget;

        setConfirmTarget(null);
        setLoadingUserId(userId);
        try {
            const res = await fetch('/api/admin/promote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, newRole }),
            });
            const data = await res.json();

            if (data.success) {
                setUsers(prev => prev.map(u =>
                    u.id === userId ? { ...u, role: newRole } : u
                ));
                showToast(`Role changed to ${roleLabel(newRole)}`, 'success');
            } else {
                showToast(data.error || 'Failed to update role', 'error');
            }
        } catch {
            showToast('Network error — please try again', 'error');
        } finally {
            setLoadingUserId(null);
        }
    };

    const copy = confirmTarget ? ROLE_CHANGE_COPY[confirmTarget.newRole] : null;

    // Red is reserved for the one change that takes something away. Moving between admin
    // and Support Agent is a sideways move, not a demotion, and colouring it as a warning
    // would overstate it.
    const losingAccess = confirmTarget?.newRole === 'user' && confirmTarget.currentRole !== 'user';

    return (
        <div className="space-y-10 pb-20">


            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <StatCard
                    title="Total Users"
                    value={users.length.toLocaleString()}
                    icon={Users}
                />
                <StatCard
                    title="Administrators"
                    value={totalAdmins.toLocaleString()}
                    icon={Shield}
                    variant="blue"
                />
                <StatCard
                    title="Support Agents"
                    value={totalAgents.toLocaleString()}
                    icon={Headset}
                    variant="emerald"
                />
                <StatCard
                    title="Standard Users"
                    value={(users.length - totalAdmins - totalAgents).toLocaleString()}
                    icon={UserCheck}
                />
                <StatCard
                    title="New (30 days)"
                    value={recentSignups.toLocaleString()}
                    icon={Clock}
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="p-6 bg-white dark:bg-obsidian rounded-xl shadow-xl overflow-hidden border border-slate-200/50 dark:border-white/5"
            >
                {/* Search & Filter Bar */}
                <div className="p-4 border-b border-slate-200 dark:border-white/5 flex flex-col sm:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <Input
                            placeholder="Search users by name or email..."
                            className="pl-10 bg-white/50 dark:bg-white/5 border-white/20 dark:border-white/10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        {ROLE_FILTERS.map(role => (
                            <Button
                                key={role}
                                variant={roleFilter === role ? 'secondary' : 'ghost'}
                                size="sm"
                                onClick={() => setRoleFilter(role)}
                                className={cn(
                                    'capitalize text-xs font-bold',
                                    roleFilter === role && 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                )}
                            >
                                {role === 'all' ? 'All Roles' : roleLabel(role)}
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Users Table */}
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Joined</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredUsers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center py-12 text-slate-400">
                                    No users found
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredUsers.map(user => (
                                <TableRow key={user.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300">
                                                {user.fullName.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="font-medium text-slate-900 dark:text-white">
                                                {user.fullName}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-slate-500 dark:text-slate-400">
                                        {user.email}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={user.role === 'admin' ? 'default' : 'outline'}
                                            className={cn(
                                                'w-32 justify-center text-center whitespace-nowrap text-[10px] font-medium px-2 py-0.5 rounded border-none',
                                                user.role === 'admin'
                                                    ? 'bg-blue-600 text-white border-blue-600'
                                                    : user.role === 'support_agent'
                                                        ? 'bg-emerald-600 text-white border-emerald-600'
                                                        : 'text-slate-500 dark:text-slate-400'
                                            )}
                                        >
                                            {roleLabel(user.role)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-slate-500 dark:text-slate-400 text-sm">
                                        {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {/*
                                          * A picker, not a toggle. With three roles there is
                                          * no single "other" role to flip to, and calling a
                                          * move to Support Agent either a promotion or a
                                          * demotion would say something untrue.
                                          */}
                                        <div className="flex items-center justify-end gap-2">
                                            {loadingUserId === user.id && (
                                                <span className="text-xs text-slate-400">Updating…</span>
                                            )}
                                            <select
                                                aria-label={`Role for ${user.email}`}
                                                disabled={loadingUserId === user.id}
                                                value={user.role}
                                                onChange={event => setConfirmTarget({
                                                    userId: user.id,
                                                    currentRole: user.role,
                                                    newRole: event.target.value as Role,
                                                })}
                                                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                                            >
                                                {ROLES.map(role => (
                                                    <option key={role} value={role}>
                                                        {roleLabel(role)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 dark:border-white/5 text-sm text-slate-400">
                    Showing {filteredUsers.length} of {users.length} users
                </div>
            </motion.div>

            {/* Role Change Confirmation Dialog */}
            <Dialog open={!!confirmTarget} onOpenChange={(open) => !open && setConfirmTarget(null)}>
                <DialogContent showCloseButton={false} className="sm:max-w-[420px] p-0">
                    <div className="px-8 pt-8 pb-4">
                        <div className={cn(
                            'w-12 h-12 rounded-xl flex items-center justify-center mb-6',
                            losingAccess
                                ? 'bg-red-500/10 text-red-500'
                                : confirmTarget?.newRole === 'support_agent'
                                    ? 'bg-emerald-500/10 text-emerald-600'
                                    : 'bg-blue-500/10 text-blue-500'
                        )}>
                            {losingAccess
                                ? <ShieldOff size={24} />
                                : confirmTarget?.newRole === 'support_agent'
                                    ? <Headset size={24} />
                                    : <ShieldAlert size={24} />}
                        </div>
                        <DialogHeader className="space-y-2">
                            <DialogTitle className="text-2xl tracking-tight">
                                {copy?.title}
                            </DialogTitle>
                            <DialogDescription className="text-base leading-relaxed">
                                {copy?.description}
                            </DialogDescription>
                        </DialogHeader>
                    </div>
                    <DialogFooter className="px-8 pb-8 pt-4 flex flex-col-reverse sm:flex-row gap-3">
                        <DialogClose asChild>
                            <Button
                                variant="ghost"
                                className="flex-1 rounded-xl font-bold h-12 text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 border border-slate-100 dark:border-white/10"
                            >
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button
                            onClick={handleRoleChange}
                            className={cn(
                                'flex-1 rounded-xl font-black h-12 shadow-lg border-0 text-white',
                                losingAccess
                                    ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
                                    : confirmTarget?.newRole === 'support_agent'
                                        ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                                        : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                            )}
                        >
                            {copy?.confirm}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Toast Notification */}
            {toast && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className={cn(
                        'fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl text-sm font-bold flex items-center gap-2',
                        toast.type === 'success'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-red-600 text-white'
                    )}
                >
                    {toast.message}
                    <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">
                        <X size={14} />
                    </button>
                </motion.div>
            )}
        </div>
    );
}
