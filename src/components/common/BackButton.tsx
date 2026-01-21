"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

interface BackButtonProps {
    label?: string;
    className?: string;
}

const BackButton: React.FC<BackButtonProps> = ({ label = "Back", className = "" }) => {
    const router = useRouter();

    return (
        <button
            onClick={() => router.back()}
            className={`flex items-center text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors group ${className}`}
        >
            <ChevronLeft size={16} className="mr-1 group-hover:-translate-x-1 transition-transform" />
            {label}
        </button>
    );
};

export default BackButton;
