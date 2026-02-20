"use client";

import React from 'react';
import { Edit3 } from 'lucide-react';

interface SectionHeaderProps {
    title: string;
    description: string;
    onEdit?: () => void;
}

export const AccountSectionHeader: React.FC<SectionHeaderProps> = ({
    title,
    description,
    onEdit
}) => (
    <>
        <div className="flex items-center justify-between mb-2">
            <h3 className="text-[clamp(0.9375rem,2vw,1.125rem)] font-semibold text-slate-900 dark:text-white">{title}</h3>
            {onEdit && (
                <button
                    onClick={onEdit}
                    className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
                >
                    <Edit3 size={14} />
                    Edit
                </button>
            )}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{description}</p>
    </>
);
