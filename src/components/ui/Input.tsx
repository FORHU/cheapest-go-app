"use client";

import React, { useState } from 'react';
import { Eye, EyeOff, LucideIcon } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    icon?: LucideIcon;
    rightIcon?: React.ReactNode;
    fullWidth?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
    label,
    error,
    icon: Icon,
    rightIcon,
    type = 'text',
    className = '',
    fullWidth = true,
    id,
    ...props
}, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

    return (
        <div className={`${fullWidth ? 'w-full' : ''} ${className}`}>
            {label && (
                <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {label}
                </label>
            )}
            <div className="relative">
                {Icon && (
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Icon className="h-5 w-5 text-slate-400" />
                    </div>
                )}
                <input
                    ref={ref}
                    type={inputType}
                    id={id}
                    className={`
                        w-full py-3 border rounded-lg bg-white dark:bg-white/5 
                        text-slate-900 dark:text-white placeholder-slate-400 
                        focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors
                        ${Icon ? 'pl-10' : 'pl-4'}
                        ${(isPassword || rightIcon) ? 'pr-12' : 'pr-4'}
                        ${error ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-white/10'}
                    `}
                    {...props}
                />

                {isPassword ? (
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                ) : rightIcon ? (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400">
                        {rightIcon}
                    </div>
                ) : null}
            </div>
            {error && (
                <p className="mt-1 text-xs text-red-500">{error}</p>
            )}
        </div>
    );
});

Input.displayName = 'Input';
