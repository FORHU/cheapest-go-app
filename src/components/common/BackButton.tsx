"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

interface BackButtonProps {
    label?: string;
    className?: string;
    href?: string; // Optional href for specific navigation
    bareIcon?: boolean; // If true, renders only the icon without text
}

const BackButton: React.FC<BackButtonProps> = ({ label = "Back", className = "", href, bareIcon = false }) => {
    const router = useRouter();

    const buttonClasses = `flex items-center text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors group ${className}`;
    const content = bareIcon ? (
        <ChevronLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
    ) : (
        <>
            <ChevronLeft size={16} className="mr-1 group-hover:-translate-x-1 transition-transform" />
            {label}
        </>
    );

    // If href is provided, use Link for direct navigation
    if (href) {
        return (
            <Link href={href} className={buttonClasses}>
                {content}
            </Link>
        );
    }

    // Otherwise, use router.back() for browser history navigation
    return (
        <button onClick={() => router.back()} className={buttonClasses}>
            {content}
        </button>
    );
};

export default BackButton;
