"use client";

import React, { useState, useTransition } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
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
} from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Booking, BookingRawData, RecoveryActionResult } from '@/types/admin';
import { toast } from 'sonner';
import {
    getBookingRawData,
    adminForceStatusRecheck,
    adminCancelBooking,
    adminForceRefund,
    adminRestoreBooking,
} from '@/lib/server/adminActions';
import { useRouter } from 'next/navigation';
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
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function BookingDetailsDialog({ booking, open, onOpenChange }: BookingDetailsDialogProps) {
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
        const result = await getBookingRawData(booking.id);
        if (result.success && result.data) {
            setRawData(result.data);
        }
        setRawDataLoading(false);
        setShowRawData(true);
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
            const result = await adminForceStatusRecheck(booking.id);
            if (result.success) {
                toast.success(result.message);
                router.refresh();
            } else {
                toast.error(result.message);
            }
        });
    };

    const handleCancelBooking = () => {
        if (!booking) return;
        setConfirmAction(null);
        startTransition(async () => {
            const result = await adminCancelBooking(booking.id);
            if (result.success) {
                toast.success(result.message);
                router.refresh();
            } else {
                toast.error(result.message);
            }
        });
    };

    const handleForceRefund = () => {
        if (!booking) return;
        setConfirmAction(null);
        startTransition(async () => {
            const result = await adminForceRefund(booking.id);
            if (result.success) {
                toast.success(result.message);
                router.refresh();
            } else {
                toast.error(result.message);
            }
        });
    };

    const handleRestoreBooking = () => {
        if (!booking) return;
        setConfirmAction(null);
        startTransition(async () => {
            const result = await adminRestoreBooking(booking.id);
            if (result.success) {
                toast.success(result.message);
                router.refresh();
            } else {
                toast.error(result.message);
            }
        });
    };

    // Reset state when dialog closes
    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setRawData(null);
            setShowRawData(false);
            setConfirmAction(null);
        }
        onOpenChange(newOpen);
    };

    if (!booking) return null;

    const isMystifly = booking.supplier?.toLowerCase() === 'mystifly';
    const isTerminal = ['cancelled', 'refunded', 'failed'].includes(booking.status.toLowerCase());

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-white dark:bg-[#0a0a0f] border-slate-200 dark:border-white/10">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${booking.type === 'flight' ? 'bg-blue-500/10' : 'bg-emerald-500/10'}`}>
                            {booking.type === 'flight' ? <Plane size={18} className="text-blue-500" /> : <Building2 size={18} className="text-emerald-500" />}
                        </div>
                        <div>
                            <span className="text-lg">Booking Details</span>
                            <p className="text-xs font-normal text-slate-400 mt-0.5">ID: {booking.id}</p>
                        </div>
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        View and manage booking {booking.bookingRef}
                    </DialogDescription>
                </DialogHeader>

                {/* Booking Info Grid */}
                <div className="grid grid-cols-2 gap-4 mt-4">
                    <InfoItem label="Reference" value={booking.bookingRef} mono />
                    {booking.pnr && <InfoItem label="PNR" value={booking.pnr} mono />}
                    <InfoItem label="Customer" value={booking.customerName} />
                    <InfoItem label="Email" value={booking.email || '—'} />
                    <InfoItem label="Amount" value={formatCurrency(booking.totalAmount, booking.currency)} />
                    <InfoItem label="Supplier" value={booking.supplier} className="uppercase" />
                    <InfoItem label="Created" value={formatDate(booking.createdAt)} />
                    <div className="space-y-1">
                        <span className="text-[10px] font-normal uppercase tracking-widest text-slate-400">Status</span>
                        <div>
                            <Badge className={`font-normal uppercase text-xs px-3 py-1 rounded-lg border-none ${booking.status.toLowerCase().includes('confirm') || booking.status.toLowerCase().includes('ticket')
                                ? 'bg-blue-500/10 text-blue-600'
                                : booking.status.toLowerCase().includes('pend')
                                    ? 'bg-amber-500/10 text-amber-600'
                                    : booking.status.toLowerCase().includes('refund')
                                        ? 'bg-violet-500/10 text-violet-600'
                                        : 'bg-rose-500/10 text-rose-600'
                                }`}>
                                {booking.status}
                            </Badge>
                        </div>
                    </div>
                </div>

                {/* Ticket IDs */}
                {booking.ticketIds.length > 0 && (
                    <div className="mt-4 space-y-1">
                        <span className="text-[10px] font-normal uppercase tracking-widest text-slate-400">Tickets</span>
                        <div className="flex flex-wrap gap-2">
                            {booking.ticketIds.map(t => (
                                <span key={t} className="font-mono text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-lg">
                                    {t}
                                </span>
                            ))}
                        </div>
                    </div>
                )}


                {/* Recovery Actions */}
                <div className="mt-6 space-y-3">
                    <h3 className="text-[10px] font-normal uppercase tracking-widest text-slate-400">Recovery Actions</h3>

                    <div className="flex flex-wrap gap-2">
                        {/* Recheck Status — Mystifly only */}
                        {isMystifly && (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={isPending}
                                onClick={handleStatusRecheck}
                                className="rounded-xl border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all gap-2 h-9 px-4"
                            >
                                {isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                Re-check Ticket Status
                            </Button>
                        )}

                        {/* Cancel Booking */}
                        {!isTerminal && (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={isPending}
                                onClick={() => setConfirmAction('cancel')}
                                className="rounded-xl border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all gap-2 h-9 px-4"
                            >
                                <XCircle size={14} />
                                Cancel Booking
                            </Button>
                        )}

                        {/* Force Refund */}
                        {booking.status.toLowerCase() !== 'refunded' && (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={isPending}
                                onClick={() => setConfirmAction('refund')}
                                className="rounded-xl border-violet-200 dark:border-violet-500/20 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all gap-2 h-9 px-4"
                            >
                                <DollarSign size={14} />
                                Force Refund
                            </Button>
                        )}

                        {/* Restore Booking — terminal states only */}
                        {isTerminal && (
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={isPending}
                                onClick={() => setConfirmAction('restore')}
                                className="rounded-xl border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all gap-2 h-9 px-4"
                            >
                                <RotateCcw size={14} />
                                Restore Booking
                            </Button>
                        )}
                    </div>
                </div>

                {/* Confirmation Modal */}
                <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
                    <AlertDialogContent className="max-w-md">
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {confirmAction === 'cancel' && "Cancel Booking"}
                                {confirmAction === 'refund' && "Force Refund"}
                                {confirmAction === 'restore' && "Restore Booking"}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {confirmAction === 'cancel' && "Are you sure you want to cancel this booking? This action will mark the booking as cancelled in our system."}
                                {confirmAction === 'refund' && "Are you sure you want to force a refund state? This will mark the booking as refunded. Note: This action does NOT trigger an automatic gateway refund."}
                                {confirmAction === 'restore' && "Are you sure you want to restore this booking? This will move it back to 'confirmed' (hotel) or 'booked' (flight) status."}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => {
                                    if (confirmAction === 'cancel') handleCancelBooking();
                                    else if (confirmAction === 'refund') handleForceRefund();
                                    else if (confirmAction === 'restore') handleRestoreBooking();
                                }}
                                className={
                                    confirmAction === 'cancel' ? "bg-rose-600 hover:bg-rose-700" :
                                        confirmAction === 'refund' ? "bg-violet-600 hover:bg-violet-700" :
                                            "bg-emerald-600 hover:bg-emerald-700"
                                }
                            >
                                {isPending ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                                Continue
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Raw API Data */}
                <div className="mt-6">
                    <button
                        onClick={handleToggleRaw}
                        className="flex items-center gap-2 text-[10px] font-normal uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors w-full"
                    >
                        {showRawData ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        Raw API / Metadata
                        {rawDataLoading && <Loader2 size={12} className="animate-spin ml-1" />}
                    </button>

                    {showRawData && rawData && (
                        <div className="mt-3 relative">
                            <button
                                onClick={handleCopyRaw}
                                className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 transition-colors text-slate-500"
                                title="Copy JSON"
                            >
                                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                            </button>
                            <pre className="bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl p-4 text-xs font-mono text-slate-600 dark:text-slate-300 overflow-x-auto max-h-[300px] overflow-y-auto leading-relaxed">
                                {rawData ? JSON.stringify(rawData.metadata || rawData, null, 2) : ''}
                            </pre>
                        </div>
                    )}

                    {showRawData && !rawData && !rawDataLoading && (
                        <p className="mt-3 text-xs text-slate-400 italic">
                            No raw data found for this booking ID.
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function InfoItem({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
    return (
        <div className="space-y-1">
            <span className="text-[10px] font-normal uppercase tracking-widest text-slate-400">{label}</span>
            <p className={`text-sm text-slate-900 dark:text-white font-normal ${mono ? 'font-mono' : ''} ${className || ''}`}>
                {value}
            </p>
        </div>
    );
}
