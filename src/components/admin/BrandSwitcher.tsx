"use client";

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type AdminBrand = 'CheapestGo' | 'GeomeeGo' | 'all';

const BRANDS: { value: AdminBrand; label: string; short: string }[] = [
    { value: 'all', label: 'All Brands', short: 'All' },
    { value: 'CheapestGo', label: 'CheapestGo', short: 'CGO' },
    { value: 'GeomeeGo', label: 'GeomeeGo', short: 'GMG' },
];

function getCookieBrand(): AdminBrand {
    if (typeof document === 'undefined') return 'CheapestGo';
    const match = document.cookie.match(/(?:^|;\s*)admin_brand_view=([^;]+)/);
    const val = match?.[1];
    if (val === 'CheapestGo' || val === 'GeomeeGo' || val === 'all') return val;
    return 'CheapestGo';
}

export function BrandSwitcher() {
    const router = useRouter();
    const [active, setActive] = useState<AdminBrand>('CheapestGo');
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setActive(getCookieBrand());
    }, []);

    const switchBrand = async (brand: AdminBrand) => {
        if (brand === active || isPending) return;
        setActive(brand);
        await fetch('/api/admin/brand', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brand }),
        });
        startTransition(() => router.refresh());
    };

    return (
        <div className="hidden sm:flex items-center bg-slate-100 dark:bg-white/5 rounded-xl p-1 gap-0.5">
            {BRANDS.map(({ value, label, short }) => {
                const isActive = active === value;
                return (
                    <button
                        key={value}
                        onClick={() => switchBrand(value)}
                        disabled={isPending}
                        title={label}
                        className={[
                            'relative px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all',
                            isActive
                                ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
                            isPending ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                        ].join(' ')}
                    >
                        <span className="lg:hidden">{short}</span>
                        <span className="hidden lg:inline">{label}</span>
                        {isActive && value !== 'all' && (
                            <span className={[
                                'absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full',
                                value === 'CheapestGo' ? 'bg-blue-500' : 'bg-emerald-500',
                            ].join(' ')} />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
