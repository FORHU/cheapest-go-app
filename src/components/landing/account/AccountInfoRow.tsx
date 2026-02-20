import React from 'react';

interface InfoRowProps {
    label: string;
    value: string;
}

export const AccountInfoRow: React.FC<InfoRowProps> = ({ label, value }) => (
    <div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</p>
        <p className={`text-sm ${value === 'Not provided' ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
            {value}
        </p>
    </div>
);
