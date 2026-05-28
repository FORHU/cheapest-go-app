'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
}

const SIZES = {
  sm: { icon: 28, text: 'text-base' },
  md: { icon: 36, text: 'text-lg' },
  lg: { icon: 44, text: 'text-2xl' },
};

export function Logo({ className, size = 'md', showWordmark = true }: LogoProps) {
  const uid = useId();
  const gradId = `cg-grad-${uid}`;
  const { icon, text } = SIZES[size];

  return (
    <div className={cn('flex items-center gap-2.5 select-none', className)}>
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 44 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>
        <circle cx="22" cy="22" r="21" fill={`url(#${gradId})`} />
        <g transform="translate(22,22) scale(1.2) translate(-12.5,-11.5)">
          <path d="M22 2L15 22L11 13L2 9Z" fill="white" />
          <path
            d="M22 2L11 13"
            stroke="rgba(30,58,138,0.3)"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </g>
      </svg>

      {showWordmark && (
        <span className={cn('font-medium tracking-tight text-slate-900 dark:text-slate-100', text)}>
          cheapest
          <span className="font-bold text-blue-600 dark:text-blue-400">Go</span>
        </span>
      )}
    </div>
  );
}
