"use client";

import React, { useState, useTransition } from 'react';
import {
    Badge,
    Button,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Booking, BookingRawData, RecoveryActionResult } from '@/types/admin';
import { toast } from 'sonner';
// Removed server actions import
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    RefreshCw,
    XCircle,
    DollarSign,
    ChevronDown,
    ChevronUp,
    Plane,
    Building2,
    AlertTriangle,
    CheckCircle2,
    Loader2,
    Copy,
    Check,
    RotateCcw,
} from 'lucide-react';

interface BookingDetailsDialogProps {
    booking: Booking | null;
    onClose: () => void;
}

export function BookingDetailsDialog({ booking, onClose }: BookingDetailsDialogProps) {
    const router = useRouter();
    const [rawData, setRawData] = useState<BookingRawData | null>(null);
    const [rawDataLoading, setRawDataLoading] = useState(false);
    const [showRawData, setShowRawData] = useState(false);
    const [confirmAction, setConfirmAction] = useState<'cancel' | 'refund' | 'restore' | null>(null);
    const [isPending, startTransition] = useTransition();
    const [copied, setCopied] = useState(false);

    // Fetch raw data when toggling the raw data section
    const handleToggleRaw = async () => {
        if (showRawData) {
            setShowRawData(false);
            return;
        }
        if (!booking) return;

        setRawDataLoading(true);
        try {
            const res = await fetch('/api/admin/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'raw', bookingId: booking.id })
            });
            const result = await res.json();
            if (res.ok && result.success && result.data) {
                setRawData(result.data);
            }
        } catch (e) {
            console.error('Failed to fetch raw data:', e);
        } finally {
            setRawDataLoading(false);
            setShowRawData(true);
        }
    };

    const handleCopyRaw = async () => {
        if (!rawData) return;
        await navigator.clipboard.writeText(JSON.stringify(rawData.metadata, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleStatusRecheck = () => {
        if (!booking) return;
        startTransition(async () => {
            try {
                const res = await fetch('/api/admin/bookings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'recheck', bookingId: booking.id })
                });
                const result = await res.json();
                if (result.success) {
                    toast.success(result.message || 'Status rechecked successfully');
                    router.refresh();
                } else {
                    toast.error(result.error || result.message || 'Failed to recheck status');
                }
            } catch (e) {
                toast.error('Network error during recheck');
            }
        });
    };

    const handleCancelBooking = () => {
        if (!booking) return;
        setConfirmAction(null);
        startTransition(async () => {
            try {
                const res = await fetch('/api/admin/bookings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'cancel', bookingId: booking.id })
                });
                const result = await res.json();
                if (result.success) {
                    toast.success(result.message || 'Booking cancelled processing');
                    router.refresh();
                } else {
                    toast.error(result.error || result.message || 'Failed to cancel booking');
                }
            } catch (e) {
                toast.error('Network error. Failed to cancel booking');
            }
        });
    };

    const handleForceRefund = () => {
        if (!booking) return;
        setConfirmAction(null);
        startTransition(async () => {
            try {
                const res = await fetch('/api/admin/bookings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'refund', bookingId: booking.id })
                });
                const result = await res.json();
                if (result.success) {
                    toast.success(result.message || 'Refund processing requested');
                    router.refresh();
                } else {
                    toast.error(result.error || result.message || 'Failed to force refund');
                }
            } catch (e) {
                toast.error('Network error. Failed to force refund');
            }
        });
    };

    const handleRestoreBooking = () => {
        if (!booking) return;
        setConfirmAction(null);
        startTransition(async () => {
            try {
                const res = await fetch('/api/admin/bookings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'restore', bookingId: booking.id })
                });
                const result = await res.json();
                if (result.success) {
                    toast.success(result.message || 'Booking restore requested');
                    router.refresh();
                } else {
                    toast.error(result.error || result.message || 'Failed to restore booking');
                }
            } catch (e) {
                toast.error('Network error. Failed to restore booking');
            }
        });
    };

    if (!booking) return null;

    const isMystifly = booking.supplier?.toLowerCase() === 'mystifly';
    const isTerminal = ['cancelled', 'refunded', 'failed'].includes(booking.status.toLowerCase());

    return (
        <Dialog open={!!booking} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-xl border-none shadow-2xl">
                <div className="bg-white dark:bg-[#0a0a0f] flex flex-col max-h-[90vh]">
                    <DialogHeader className="px-6 py-8 flex flex-row items-center justify-between border-b border-slate-100 dark:border-white/5 space-y-0">
                        <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-xl ${booking.type === 'flight' ? 'bg-blue-500/10' : 'bg-emerald-500/10'}`}>
                                {booking.type === 'flight' ? <Plane size={24} className="text-blue-500" /> : <Building2 size={24} className="text-emerald-500" />}
                            </div>
                            <div className="flex flex-col text-left">
                                <DialogTitle className="text-xl font-black text-slate-900 dark:text-white leading-tight">Booking Details</DialogTitle>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Reference: {booking.bookingRef}</p>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-8 space-y-10 custom-scrollbar">
                        {/* Main Info Grid */}
                        <div className="grid grid-cols-2 gap-y-8 gap-x-6">
                            <InfoItem label="System ID" value={booking.id} mono className="text-[10px] text-slate-400" />
                            <InfoItem label="PNR" value={booking.pnr || '—'} mono />
                            <InfoItem label="Customer" value={booking.customerName} />
                            <InfoItem label="Email Address" value={booking.email || '—'} />
                            <InfoItem label="Total Amount" value={formatCurrency(booking.totalAmount, booking.currency)} className="text-blue-600 dark:text-blue-400 font-bold" />
                            <InfoItem label="Payment Provider" value={booking.supplier.toLowerCase()} className="capitalize" />
                            <InfoItem label="Booking Type" value={booking.type.toLowerCase()} className="capitalize" />
                            <InfoItem label="Creation Date" value={formatDate(booking.createdAt)} />

                            <div className="space-y-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400/80">Current Status</span>
                                <div>
                                    <Badge className={`font-bold capitalize text-[10px] px-3 py-1 rounded-lg border-none ${booking.status.toLowerCase().includes('confirm') || booking.status.toLowerCase().includes('ticket')
                                        ? 'bg-blue-500/10 text-blue-600'
                                        : booking.status.toLowerCase().includes('pend')
                                            ? 'bg-amber-500/10 text-amber-600'
                                            : booking.status.toLowerCase().includes('refund')
                                                ? 'bg-violet-500/10 text-violet-600'
                                                : 'bg-rose-500/10 text-rose-600'
                                        }`}>
                                        {booking.status.toLowerCase().replace(/_/g, ' ')}
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        {/* Ticket IDs */}
                        {booking.ticketIds.length > 0 && (
                            <div className="space-y-3">
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400/80">Issued Tickets</h3>
                                <div className="flex flex-wrap gap-2">
                                    {booking.ticketIds.map(t => (
                                        <span key={t} className="font-mono text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 px-3 py-1.5 rounded-xl border border-slate-200/50 dark:border-white/5 shadow-sm">
                                            {t}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Recovery Actions */}
                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/5">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400/80">Management Actions</h3>
                            <div className="flex flex-wrap gap-3">
                                {isMystifly && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={isPending}
                                        onClick={handleStatusRecheck}
                                        className="rounded-xl border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all gap-2 h-10 px-4 font-bold text-xs"
                                    >
                                        {isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                        Sync Status
                                    </Button>
                                )}

                                {!isTerminal && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={isPending}
                                        onClick={() => setConfirmAction('cancel')}
                                        className="rounded-xl border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all gap-2 h-10 px-4 font-bold text-xs"
                                    >
                                        <XCircle size={14} />
                                        Cancel Booking
                                    </Button>
                                )}

                                {booking.status.toLowerCase() !== 'refunded' && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={isPending}
                                        onClick={() => setConfirmAction('refund')}
                                        className="rounded-xl border-violet-200 dark:border-violet-500/20 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all gap-2 h-10 px-4 font-bold text-xs"
                                    >
                                        <DollarSign size={14} />
                                        Force Refund
                                    </Button>
                                )}

                                {isTerminal && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={isPending}
                                        onClick={() => setConfirmAction('restore')}
                                        className="rounded-xl border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all gap-2 h-10 px-4 font-bold text-xs"
                                    >
                                        <RotateCcw size={14} />
                                        Restore Record
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Raw API Data */}
                        <div className="pt-4 border-t border-slate-100 dark:border-white/5 pb-8">
                            <button
                                onClick={handleToggleRaw}
                                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors w-full"
                            >
                                {showRawData ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                Raw API / Metadata
                                {rawDataLoading && <Loader2 size={12} className="animate-spin ml-1" />}
                            </button>

                            {showRawData && rawData && (
                                <div className="mt-4 relative">
                                    <button
                                        onClick={handleCopyRaw}
                                        className="absolute top-3 right-3 p-2 rounded-xl bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 transition-colors text-slate-500 shadow-sm border border-slate-200 dark:border-white/10"
                                        title="Copy JSON"
                                    >
                                        {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                    </button>
                                    <div className="bg-slate-50 dark:bg-blue-900/5 p-5 rounded-xl border border-slate-100 dark:border-blue-900/10 text-[11px] font-mono text-slate-600 dark:text-slate-300 overflow-x-auto max-h-[400px] overflow-y-auto leading-relaxed shadow-inner">
                                        {JSON.stringify(rawData.metadata || rawData, null, 2)}
                                    </div>
                                </div>
                            )}

                            {showRawData && !rawData && !rawDataLoading && (
                                <p className="mt-4 text-xs text-slate-400 italic font-medium px-2">
                                    No raw metadata available for this record.
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Confirmation Modal */}
                <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
                    <AlertDialogContent className="max-w-md rounded-xl">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-lg font-black">
                                {confirmAction === 'cancel' && "Cancel Booking"}
                                {confirmAction === 'refund' && "Force Refund"}
                                {confirmAction === 'restore' && "Restore Booking"}
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-sm font-medium">
                                {confirmAction === 'cancel' && "Are you sure you want to cancel this booking? This action will mark the booking as cancelled in our system."}
                                {confirmAction === 'refund' && "Are you sure you want to force a refund state? This will mark the booking as refunded. Note: This action does NOT trigger an automatic gateway refund."}
                                {confirmAction === 'restore' && "Are you sure you want to restore this booking? This will move it back to 'confirmed' (hotel) or 'booked' (flight) status."}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="mt-6 gap-3">
                            <AlertDialogCancel className="rounded-xl h-11 px-6 font-bold">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => {
                                    if (confirmAction === 'cancel') handleCancelBooking();
                                    else if (confirmAction === 'refund') handleForceRefund();
                                    else if (confirmAction === 'restore') handleRestoreBooking();
                                }}
                                className={cn(
                                    "rounded-xl h-11 px-6 font-bold shadow-lg shadow-blue-500/20 border-0",
                                    confirmAction === 'cancel' ? "bg-rose-600 hover:bg-rose-700" :
                                        confirmAction === 'refund' ? "bg-violet-600 hover:bg-violet-700" :
                                            "bg-emerald-600 hover:bg-emerald-700"
                                )}
                            >
                                {isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                                Confirm Action
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </DialogContent>
        </Dialog>
    );
}

function InfoItem({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
    return (
        <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400/80">{label}</span>
            <p className={cn(
                "text-sm text-slate-900 dark:text-white font-medium break-words",
                mono && "font-mono text-xs",
                className
            )}>
                {value}
            </p>
        </div>
    );
}
