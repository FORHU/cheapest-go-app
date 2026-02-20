"use client";

import React from 'react';
import { ChevronRight } from 'lucide-react';

interface SidebarItemProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    active?: boolean;
    onClick?: () => void;
}

export const AccountSidebarItem: React.FC<SidebarItemProps> = ({
    icon,
    title,
    description,
    active,
    onClick
}) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-4 p-4 rounded-xl text-left transition-colors ${active
                ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                : 'hover:bg-slate-50 dark:hover:bg-white/5 border border-transparent'
            }`}
    >
        <div className={`${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}>
            {icon}
        </div>
        <div className="flex-1 min-w-0">
            <p className={`font-medium text-sm ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-900 dark:text-white'}`}>
                {title}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{description}</p>
        </div>
        <ChevronRight className={`h-4 w-4 ${active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-300 dark:text-slate-600'}`} />
    </button>
);
