"use client";

import React from 'react';
import { ChevronRight } from 'lucide-react';

interface DetailCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    onClick?: () => void;
}

export const AccountDetailCard: React.FC<DetailCardProps> = ({
    icon,
    title,
    description,
    onClick
}) => (
    <button
        onClick={onClick}
        className="w-full flex items-center gap-4 p-4 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl hover:bg-slate-50 dark:hover:bg-white/10 transition-colors text-left"
    >
        <div className="text-slate-400">{icon}</div>
        <div className="flex-1">
            <p className="font-medium text-sm text-slate-900 dark:text-white">{title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
    </button>
);
