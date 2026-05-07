"use client";

import React, { useState, useMemo } from 'react';

import { StatCard } from '@/components/admin/StatCard';
import { Users, Shield, Search, UserCheck, Clock, X, ShieldAlert, ShieldOff } from 'lucide-react';
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

interface UsersManagementClientProps {
    initialUsers: AdminUserRecord[];
}

export function UsersManagementClient({ initialUsers }: UsersManagementClientProps) {
    const [users, setUsers] = useState(initialUsers);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'admin'>('all');
    const [loadingUserId, setLoadingUserId] = useState<string | null>(null);
    const [confirmTarget, setConfirmTarget] = useState<{ userId: string; currentRole: string } | null>(null);
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
        const { userId, currentRole } = confirmTarget;
        const newRole = currentRole === 'admin' ? 'user' : 'admin';

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
                    u.id === userId ? { ...u, role: newRole as 'user' | 'admin' } : u
                ));
                showToast(`User ${newRole === 'admin' ? 'promoted to Admin' : 'demoted to User'} successfully`, 'success');
            } else {
                showToast(data.error || 'Failed to update role', 'error');
            }
        } catch {
            showToast('Network error — please try again', 'error');
        } finally {
            setLoadingUserId(null);
        }
    };

    return (
        <div className="space-y-10 pb-20">


            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                    title="Standard Users"
                    value={(users.length - totalAdmins).toLocaleString()}
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
                        {(['all', 'admin', 'user'] as const).map(role => (
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
                                {role === 'all' ? 'All Roles' : role === 'admin' ? 'Admins' : 'Users'}
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
                                                    : 'text-slate-500 dark:text-slate-400'
                                            )}
                                        >
                                            {user.role === 'admin' ? 'Admin' : 'User'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-slate-500 dark:text-slate-400 text-sm">
                                        {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={loadingUserId === user.id}
                                            onClick={() => setConfirmTarget({ userId: user.id, currentRole: user.role })}
                                            className={cn(
                                                'text-xs font-bold rounded-lg',
                                                user.role === 'admin'
                                                    ? 'text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30'
                                                    : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                                            )}
                                        >
                                            {loadingUserId === user.id
                                                ? 'Updating...'
                                                : user.role === 'admin'
                                                    ? 'Demote'
                                                    : 'Promote'
                                            }
                                        </Button>
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
                            confirmTarget?.currentRole === 'admin'
                                ? 'bg-red-500/10 text-red-500'
                                : 'bg-blue-500/10 text-blue-500'
                        )}>
                            {confirmTarget?.currentRole === 'admin' ? <ShieldOff size={24} /> : <ShieldAlert size={24} />}
                        </div>
                        <DialogHeader className="space-y-2">
                            <DialogTitle className="text-2xl tracking-tight">
                                {confirmTarget?.currentRole === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                            </DialogTitle>
                            <DialogDescription className="text-base leading-relaxed">
                                {confirmTarget?.currentRole === 'admin'
                                    ? 'This user will lose all administrator privileges. They will no longer be able to access the admin dashboard.'
                                    : 'This user will gain full administrator privileges, including access to the admin dashboard and user management.'}
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
                                confirmTarget?.currentRole === 'admin'
                                    ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
                                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                            )}
                        >
                            {confirmTarget?.currentRole === 'admin' ? 'Demote' : 'Promote'}
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
