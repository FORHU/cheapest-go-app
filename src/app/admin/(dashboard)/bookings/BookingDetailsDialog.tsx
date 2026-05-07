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
    Input,
} from '@/components/ui';
import { formatCurrency, formatDate, cn, formatStatus } from '@/lib/utils';
import { TabList } from '@/components/ui/TabList';
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
    Users,
    User,
    Baby,
    Info,
    FileText,
    Download,
    Mail,
    ArrowUpRight,
    Clock,
    AlertCircle,
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
    const [refundHistory, setRefundHistory] = useState<any[]>([]);
    const [refundHistoryLoading, setRefundHistoryLoading] = useState(false);
    const [refundReason, setRefundReason] = useState("");
    const [activeTab, setActiveTab] = useState("General");
    const [emailLogs, setEmailLogs] = useState<any[]>([]);
    const [emailLogsLoading, setEmailLogsLoading] = useState(false);
    const [isResending, setIsResending] = useState(false);

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
                    body: JSON.stringify({ action: 'refund', bookingId: booking.id, reason: refundReason })
                });
                const result = await res.json();
                if (result.success) {
                    toast.success(result.message || 'Refund processing requested');
                    setRefundReason("");
                    fetchRefundHistory();
                    router.refresh();
                } else {
                    toast.error(result.error || result.message || 'Failed to force refund');
                }
            } catch (e) {
                toast.error('Network error. Failed to force refund');
            }
        });
    };

    const fetchRefundHistory = async () => {
        if (!booking) return;
        setRefundHistoryLoading(true);
        try {
            const res = await fetch('/api/admin/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'refund_history', bookingId: booking.id })
            });
            const result = await res.json();
            if (result.success) {
                setRefundHistory(result.data || []);
            }
        } catch (e) {
            console.error('Failed to fetch refund history:', e);
        } finally {
            setRefundHistoryLoading(false);
        }
    };

    const fetchEmailLogs = async () => {
        if (!booking) return;
        setEmailLogsLoading(true);
        try {
            const res = await fetch('/api/admin/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'email_logs', bookingId: booking.id })
            });
            const result = await res.json();
            if (result.success) {
                setEmailLogs(result.data || []);
            }
        } catch (e) {
            console.error('Failed to fetch email logs:', e);
        } finally {
            setEmailLogsLoading(false);
        }
    };

    const handleResendEmail = async () => {
        if (!booking) return;
        setIsResending(true);
        try {
            const res = await fetch('/api/admin/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'resend_email', bookingId: booking.id })
            });
            const result = await res.json();
            if (result.success) {
                toast.success('Confirmation email resent successfully');
                fetchEmailLogs();
            } else {
                toast.error(result.error || 'Failed to resend email');
            }
        } catch (e) {
            toast.error('Network error. Failed to resend email');
        } finally {
            setIsResending(false);
        }
    };

    React.useEffect(() => {
        if (booking) {
            fetchRefundHistory();
            fetchEmailLogs();
        }
    }, [booking?.id]);

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
                        <div className="flex items-center gap-2">
                            <TabList 
                                tabs={["General", "Communication"]} 
                                activeTab={activeTab} 
                                onTabChange={setActiveTab} 
                                className="pb-0"
                            />
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-8 custom-scrollbar">
                        <AnimatePresence mode="wait">
                            {activeTab === "General" ? (
                                <motion.div
                                    key="general"
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 10 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-10"
                                >
                        {/* Main Info Grid */}
                        <div className="grid grid-cols-2 gap-y-8 gap-x-6">
                            <InfoItem label="System ID" value={booking.id} mono className="text-[10px] text-slate-400" />
                            <InfoItem label="PNR" value={booking.pnr || '—'} mono />
                            <InfoItem label="Customer" value={booking.customerName} />
                            <InfoItem label="Email Address" value={booking.email || '—'} />
                            <InfoItem label="Total Amount" value={formatCurrency(booking.totalAmount, booking.currency)} className="text-blue-600 dark:text-blue-400 font-bold" />
                            <InfoItem label="Payment Provider" value={formatStatus(booking.supplier)} />
                            <InfoItem label="Booking Type" value={formatStatus(booking.type)} />
                            <InfoItem label="Creation Date" value={formatDate(booking.createdAt)} />

                            <div className="space-y-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400/80">Current Status</span>
                                <div>
                                    <Badge className={`w-32 justify-center text-center whitespace-nowrap font-bold text-[10px] px-3 py-1 rounded-lg border-none ${booking.status.toLowerCase().includes('confirm') || booking.status.toLowerCase().includes('ticket')
                                        ? 'bg-blue-500/10 text-blue-600'
                                        : booking.status.toLowerCase().includes('pend')
                                            ? 'bg-amber-500/10 text-amber-600'
                                            : booking.status.toLowerCase().includes('refund')
                                                ? 'bg-violet-500/10 text-violet-600'
                                                : 'bg-rose-500/10 text-rose-600'
                                        }`}>
                                        {formatStatus(booking.status)}
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        {/* Travelers / Guests Section */}
                        <TravelersSection booking={booking} />

                        {/* Financial Breakdown Section */}
                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/5 bg-blue-50/30 dark:bg-blue-900/5 -mx-6 px-6 py-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400/80">Financial Breakdown</h3>
                                {(booking as any).isEstimated && (
                                    <Badge variant="outline" className="text-[9px] font-bold uppercase bg-amber-500/10 text-amber-600 border-amber-200/50 flex items-center gap-1 py-0 h-5">
                                        <Info size={10} />
                                        Estimated
                                    </Badge>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-6">
                                <div className="space-y-1">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400/60">Supplier Cost</span>
                                    <p className="text-sm font-black text-slate-700 dark:text-slate-300">
                                        {formatCurrency(booking.supplierCost, booking.currency)}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400/60">Markup</span>
                                    <p className="text-sm font-black text-blue-600 dark:text-blue-400">
                                        +{formatCurrency(booking.markupAmount, booking.currency)}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400/60">Net Profit</span>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                                            {formatCurrency(booking.profit, booking.currency)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            {(booking as any).isEstimated && (
                                <p className="text-[9px] text-slate-400 italic">
                                    * Supplier cost estimated using {booking.type === 'bundle' || booking.type === 'hotel_bundle' ? '15%' : booking.type === 'flight' ? '8%' : '12%'} standard markup policy.
                                </p>
                            )}
                        </div>

                        {/* Hotel Specific Details (Phase 3) */}
                        {booking.type === 'hotel' && (
                            <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/5">
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400/80">Hotel Reservation Details</h3>
                                <div className="grid grid-cols-2 gap-y-6 gap-x-6">
                                    <InfoItem
                                        label="Cancellation Deadline"
                                        value={(booking as any).metadata?.cancellationDeadline ? formatDate((booking as any).metadata.cancellationDeadline) : '—'}
                                        className="text-rose-500 font-bold"
                                    />
                                    <InfoItem
                                        label="Supplier Confirmation"
                                        value={(booking as any).metadata?.supplierConfirmationNumber || (booking as any).metadata?.confirmationNumber || '—'}
                                        mono
                                    />
                                    <InfoItem
                                        label="Commission Amount"
                                        value={(booking as any).metadata?.commissionAmount ? formatCurrency((booking as any).metadata.commissionAmount, (booking as any).metadata.commissionCurrency || 'USD') : '—'}
                                    />
                                    <InfoItem
                                        label="Payout Status"
                                        value={(booking as any).metadata?.payoutStatus || 'Pending'}
                                        className="capitalize"
                                    />
                                </div>
                            </div>
                        )}

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
                                    <div className="flex flex-col gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={isPending || !booking.isRefundable}
                                            onClick={() => setConfirmAction('refund')}
                                            className={cn(
                                                "rounded-xl border-violet-200 dark:border-violet-500/20 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all gap-2 h-10 px-4 font-bold text-xs",
                                                !booking.isRefundable && "opacity-50 grayscale cursor-not-allowed border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500"
                                            )}
                                        >
                                            <DollarSign size={14} />
                                            {booking.isRefundable ? "Force Refund" : "Non-Refundable"}
                                        </Button>
                                        {!booking.isRefundable && (
                                            <span className="text-[9px] font-bold text-rose-500 uppercase tracking-tighter px-1">
                                                <AlertTriangle size={10} className="inline mr-1" />
                                                Policy: Non-Refundable
                                            </span>
                                        )}
                                    </div>
                                )}

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.open(`/trips/invoice/${booking.id}?type=${booking.type === 'hotel' ? 'hotel' : 'flight'}`, '_blank')}
                                    className="rounded-xl border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-all gap-2 h-10 px-4 font-bold text-xs"
                                >
                                    <FileText size={14} />
                                    View Receipt
                                </Button>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                        const type = booking.type === 'hotel' ? 'hotel' : 'flight';
                                        try {
                                            const res = await fetch(`/api/invoice/${booking.id}/pdf?type=${type}`);
                                            if (!res.ok) throw new Error('PDF generation failed');
                                            const blob = await res.blob();
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `CheapestGo-Receipt-INV-${booking.id.slice(0, 8).toUpperCase()}.pdf`;
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                            URL.revokeObjectURL(url);
                                        } catch {
                                            alert('Failed to download PDF. Please try again.');
                                        }
                                    }}
                                    className="rounded-xl border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all gap-2 h-10 px-4 font-bold text-xs"
                                >
                                    <Download size={14} />
                                    Download PDF
                                </Button>

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

                        {/* Refund History */}
                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/5">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400/80">Refund History</h3>
                                {refundHistoryLoading && <Loader2 size={12} className="animate-spin text-slate-400" />}
                            </div>

                            {refundHistory.length > 0 ? (
                                <div className="space-y-3">
                                    {refundHistory.map((log: any) => (
                                        <div key={log.id} className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-101 dark:border-white/5 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Badge variant="outline" className={`text-[10px] font-bold uppercase h-5 rounded-md px-1.5 ${log.processed_by === 'admin' ? 'bg-amber-500/10 text-amber-600 border-amber-200/50' : 'bg-blue-500/10 text-blue-600 border-blue-200/50'
                                                    }`}>
                                                    {log.processed_by === 'admin' ? 'Admin Triggered' : 'Auto/System'}
                                                </Badge>
                                                <span className="text-[10px] text-slate-400 font-medium">
                                                    {formatDate(log.processed_at || log.requested_at)}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-bold text-slate-900 dark:text-white">
                                                    {formatCurrency(log.approved_amount || log.requested_amount, log.currency)}
                                                </span>
                                                <span className={`text-[10px] font-bold uppercase ${log.status === 'processed' ? 'text-emerald-500' : 'text-amber-500'
                                                    }`}>
                                                    {log.status}
                                                </span>
                                            </div>
                                            {log.status_reason && (
                                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed italic">
                                                    "{log.status_reason}"
                                                </p>
                                            )}
                                            {log.external_ref && (
                                                <div className="pt-1 flex items-center justify-between border-t border-slate-100 dark:border-white/5 mt-1">
                                                    <span className="text-[10px] text-slate-400 font-mono">ID: {log.external_ref.slice(0, 20)}...</span>
                                                    {log.external_ref.startsWith('re_') && (
                                                        <a
                                                            href={`https://dashboard.stripe.com/refunds/${log.external_ref}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[10px] text-blue-500 hover:underline font-bold"
                                                        >
                                                            View Stripe
                                                        </a>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : !refundHistoryLoading ? (
                                <p className="text-xs text-slate-400 italic px-2">No refund sessions recorded for this booking.</p>
                            ) : null}
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
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="communication"
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    transition={{ duration: 0.2 }}
                                    className="space-y-8"
                                >
                                    {/* Communication Tab Content */}
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-1">
                                            <h3 className="text-sm font-black text-slate-900 dark:text-white">Customer Communication</h3>
                                            <p className="text-xs text-slate-500">History of automated and manual emails sent to this customer.</p>
                                        </div>
                                        <Button
                                            onClick={handleResendEmail}
                                            disabled={isResending}
                                            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white gap-2 font-bold text-xs h-10 px-6 shadow-lg shadow-indigo-500/20"
                                        >
                                            {isResending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                                            Resend Confirmation
                                        </Button>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400/80">Email History</h3>
                                            {emailLogsLoading && <Loader2 size={12} className="animate-spin text-slate-400" />}
                                        </div>

                                        {emailLogs.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-12 px-6 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 text-center space-y-3">
                                                <div className="p-3 rounded-full bg-white dark:bg-white/5 shadow-sm">
                                                    <Mail size={24} className="text-slate-300" />
                                                </div>
                                                <p className="text-xs text-slate-500 font-medium">No email history found for this booking.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {emailLogs.map((log) => (
                                                    <div key={log.id} className="p-4 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex items-center justify-between group hover:border-indigo-500/30 transition-all">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`p-2 rounded-lg ${
                                                                log.status === 'sent' ? 'bg-emerald-500/10 text-emerald-500' : 
                                                                log.status === 'failed' ? 'bg-rose-500/10 text-rose-500' : 
                                                                'bg-amber-500/10 text-amber-500'
                                                            }`}>
                                                                {log.status === 'sent' ? <CheckCircle2 size={16} /> : 
                                                                 log.status === 'failed' ? <AlertCircle size={16} /> : 
                                                                 <Clock size={16} />}
                                                            </div>
                                                            <div className="space-y-0.5">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-xs font-bold text-slate-900 dark:text-white capitalize">
                                                                        {log.email_type.replace('_', ' ')} Email
                                                                    </p>
                                                                    <Badge variant="outline" className={`text-[9px] font-bold uppercase py-0 h-4 ${
                                                                        log.status === 'sent' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                                                        log.status === 'failed' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                                                                        'bg-amber-50 text-amber-600 border-amber-200'
                                                                    }`}>
                                                                        {log.status}
                                                                    </Badge>
                                                                </div>
                                                                <p className="text-[10px] text-slate-500 font-medium">{log.recipient}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1">
                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                {formatDate(log.created_at)}
                                                            </span>
                                                            <span className="text-[9px] text-slate-400/60 font-mono">
                                                                {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-6 rounded-2xl bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/10 space-y-3">
                                        <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                                            <Info size={14} />
                                            <h4 className="text-[10px] font-black uppercase tracking-widest">Resend Rules</h4>
                                        </div>
                                        <ul className="space-y-2">
                                            <li className="text-[10px] text-slate-500 dark:text-slate-400 flex items-start gap-2">
                                                <div className="w-1 h-1 rounded-full bg-indigo-400 mt-1.5" />
                                                Resending triggers the standard confirmation email with the current receipt link.
                                            </li>
                                            <li className="text-[10px] text-slate-500 dark:text-slate-400 flex items-start gap-2">
                                                <div className="w-1 h-1 rounded-full bg-indigo-400 mt-1.5" />
                                                The email is always sent to the customer's primary email address associated with this booking.
                                            </li>
                                        </ul>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Confirmation Modal */}
                < AlertDialog open={!!confirmAction
                } onOpenChange={(open) => !open && setConfirmAction(null)}>
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

                            {confirmAction === 'refund' && (
                                <div className="mt-4">
                                    <Input
                                        label="Refund Reason"
                                        placeholder="e.g. Manual override via Stripe dashboard"
                                        value={refundReason}
                                        onChange={(e) => setRefundReason(e.target.value)}
                                        className="h-10 rounded-xl"
                                    />
                                </div>
                            )}
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

const PAX_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    ADT: { label: 'Adult', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    adult: { label: 'Adult', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
    CHD: { label: 'Child', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    child: { label: 'Child', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
    INF: { label: 'Infant', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
    infant: { label: 'Infant', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
};

function getPaxIcon(type: string) {
    const t = type?.toLowerCase();
    if (t === 'inf' || t === 'infant') return <Baby size={14} />;
    if (t === 'chd' || t === 'child') return <User size={14} />;
    return <User size={14} />;
}

function TravelersSection({ booking }: { booking: Booking }) {
    const meta = booking.metadata as any;
    if (!meta) return null;

    // Flight passengers (unified + legacy)
    const passengers: { firstName: string; lastName: string; type: string; ticketNumber?: string; email?: string }[] = meta?.passengers || [];

    // Hotel guests
    const holder = meta?.holder;
    const guests = meta?.guests;

    const hasFlightPassengers = booking.type === 'flight' && passengers.length > 0;
    const hasHotelGuests = booking.type === 'hotel' && (holder || guests);

    if (!hasFlightPassengers && !hasHotelGuests) return null;

    // Count by type for summary
    const countByType = passengers.reduce((acc: Record<string, number>, p) => {
        const key = PAX_TYPE_LABELS[p.type]?.label || p.type || 'Adult';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const summary = Object.entries(countByType).map(([k, v]) => `${v} ${k}${v > 1 ? 's' : ''}`).join(', ');

    return (
        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/5">
            <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400/80 flex items-center gap-2">
                    <Users size={12} />
                    {booking.type === 'flight' ? 'Passengers' : 'Guests'}
                </h3>
                {hasFlightPassengers && (
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-full">
                        {summary}
                    </span>
                )}
                {hasHotelGuests && guests && (
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-full">
                        {guests.adults || 1} Adult{(guests.adults || 1) > 1 ? 's' : ''}
                        {guests.children > 0 ? `, ${guests.children} Child${guests.children > 1 ? 'ren' : ''}` : ''}
                    </span>
                )}
            </div>

            {/* Flight passengers list */}
            {hasFlightPassengers && (
                <div className="space-y-2">
                    {passengers.map((pax, i) => {
                        const typeInfo = PAX_TYPE_LABELS[pax.type] || PAX_TYPE_LABELS['adult'];
                        return (
                            <div key={i} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/[0.03] rounded-xl border border-slate-100/50 dark:border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", typeInfo.color)}>
                                        {getPaxIcon(pax.type)}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-800 dark:text-white">
                                            {pax.firstName} {pax.lastName}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded", typeInfo.color)}>
                                                {typeInfo.label}
                                            </span>
                                            {pax.email && (
                                                <span className="text-[10px] text-slate-400">{pax.email}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {pax.ticketNumber && (
                                    <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-lg">
                                        {pax.ticketNumber}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Hotel guest info */}
            {hasHotelGuests && holder && (
                <div className="p-3 bg-slate-50 dark:bg-white/[0.03] rounded-xl border border-slate-100/50 dark:border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <User size={14} />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-800 dark:text-white">
                                {holder.firstName} {holder.lastName}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                    Primary Guest
                                </span>
                                {holder.email && (
                                    <span className="text-[10px] text-slate-400">{holder.email}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
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
