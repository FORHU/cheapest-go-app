"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, CreditCard, Mail, Plane, Globe, Building2 } from 'lucide-react';
import type { ProviderIntegrationsData, ProviderStatus } from '@/types/admin';

interface ProviderIntegrationsProps {
    data: ProviderIntegrationsData;
}

function StatusDot({ status }: { status: ProviderStatus }) {
    const color: Record<ProviderStatus, string> = {
        healthy: 'bg-emerald-500',
        error: 'bg-rose-500',
        not_configured: 'bg-slate-400',
    };
    const label: Record<ProviderStatus, string> = {
        healthy: 'Connected',
        error: 'Error',
        not_configured: 'Not Configured',
    };
    return (
        <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${color[status]} ${status === 'healthy' ? 'animate-pulse' : ''}`} />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label[status]}</span>
        </div>
    );
}

function MetricRow({ label, value }: { label: string; value: string | number | null }) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-white/5 last:border-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
            <span className="text-sm font-black text-slate-900 dark:text-white">{value ?? '---'}</span>
        </div>
    );
}

function formatCents(cents: number | null): string {
    if (cents === null) return '---';
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
}

function ProviderCard({ children, icon: Icon, name, status, dashboardUrl, iconBg, delay = 0 }: {
    children: React.ReactNode;
    icon: React.ElementType;
    name: string;
    status: ProviderStatus;
    dashboardUrl: string;
    iconBg: string;
    delay?: number;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            whileHover={{ y: -4 }}
            className="bg-white dark:bg-obsidian border border-slate-100 dark:border-white/10 rounded-xl p-6 shadow-md flex flex-col group transition-all duration-500 relative overflow-hidden"
        >
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
                        <Icon size={20} />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{name}</h4>
                        <StatusDot status={status} />
                    </div>
                </div>
            </div>

            <div className="flex-1 mb-4">{children}</div>

            <a
                href={dashboardUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-blue-600 hover:text-blue-500 transition-colors pt-4 border-t border-slate-100 dark:border-white/5"
            >
                Open Dashboard <ExternalLink size={12} />
            </a>

            <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-blue-500/5 blur-2xl rounded-full pointer-events-none" />
        </motion.div>
    );
}

export function ProviderIntegrations({ data }: ProviderIntegrationsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {/* Stripe */}
            <ProviderCard
                name="Stripe"
                icon={CreditCard}
                status={data.stripe.status}
                dashboardUrl="https://dashboard.stripe.com"
                iconBg="bg-indigo-500/10 text-indigo-500"
                delay={0}
            >
                <MetricRow label="Available Balance" value={formatCents(data.stripe.balance)} />
                <MetricRow label="Recent Payments" value={data.stripe.recentPaymentCount} />
                <MetricRow label="Payment Volume" value={formatCents(data.stripe.totalVolume)} />
                <MetricRow label="Recent Refunds" value={data.stripe.refundCount} />
            </ProviderCard>

            {/* Resend */}
            <ProviderCard
                name="Resend"
                icon={Mail}
                status={data.resend.status}
                dashboardUrl="https://resend.com/emails"
                iconBg="bg-emerald-500/10 text-emerald-500"
                delay={0.05}
            >
                <MetricRow label="Recent Emails" value={data.resend.recentEmailCount} />
                <MetricRow label="Delivery Rate" value={data.resend.deliveryRate !== null ? `${data.resend.deliveryRate}%` : null} />
                <MetricRow label="Domain Status" value={data.resend.domainStatus?.replace(/_/g, ' ') ?? null} />
            </ProviderCard>

            {/* Duffel */}
            <ProviderCard
                name="Duffel"
                icon={Plane}
                status={data.duffel.status}
                dashboardUrl="https://app.duffel.com"
                iconBg="bg-blue-500/10 text-blue-500"
                delay={0.1}
            >
                <MetricRow label="Recent Orders" value={data.duffel.recentOrderCount} />
                <MetricRow label="Last Order" value={data.duffel.lastOrderDate ? new Date(data.duffel.lastOrderDate).toLocaleDateString() : null} />
            </ProviderCard>

            {/* Mystifly */}
            <ProviderCard
                name="Mystifly"
                icon={Globe}
                status={data.mystifly.status}
                dashboardUrl="https://myfarebox.com"
                iconBg="bg-amber-500/10 text-amber-500"
                delay={0.15}
            >
                <MetricRow label="Total Bookings" value={data.mystifly.bookingCount} />
                <MetricRow label="Config Status" value={data.mystifly.configStatus?.replace(/_/g, ' ') ?? null} />
            </ProviderCard>

            {/* LiteAPI */}
            <ProviderCard
                name="LiteAPI"
                icon={Building2}
                status={data.liteapi.status}
                dashboardUrl="https://liteapi.com"
                iconBg="bg-rose-500/10 text-rose-500"
                delay={0.2}
            >
                <MetricRow label="Total Searches" value={data.liteapi.searchCount} />
                <MetricRow label="Total Bookings" value={data.liteapi.bookingCount} />
            </ProviderCard>
        </div>
    );
}
