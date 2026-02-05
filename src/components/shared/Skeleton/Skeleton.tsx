import React from 'react';

export interface SkeletonProps {
    /** Width of the skeleton */
    width?: string | number;
    /** Height of the skeleton */
    height?: string | number;
    /** Border radius */
    rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
    /** Additional CSS classes */
    className?: string;
    /** Animation type */
    animation?: 'pulse' | 'wave' | 'none';
}

const roundedClasses = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    full: 'rounded-full',
};

const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'skeleton-wave',
    none: '',
};

/**
 * Base Skeleton component
 *
 * @example
 * <Skeleton width={200} height={20} />
 * <Skeleton width="100%" height={40} rounded="lg" />
 */
export const Skeleton: React.FC<SkeletonProps> = ({
    width,
    height,
    rounded = 'md',
    className = '',
    animation = 'pulse',
}) => {
    const style: React.CSSProperties = {
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
    };

    return (
        <div
            className={`
                bg-slate-200 dark:bg-slate-700
                ${roundedClasses[rounded]}
                ${animationClasses[animation]}
                ${className}
            `.trim()}
            style={style}
            aria-hidden="true"
        />
    );
};

/**
 * Text skeleton - simulates a line of text
 */
export const SkeletonText: React.FC<{
    lines?: number;
    className?: string;
}> = ({ lines = 1, className = '' }) => {
    return (
        <div className={`space-y-2 ${className}`}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    height={16}
                    width={i === lines - 1 && lines > 1 ? '75%' : '100%'}
                />
            ))}
        </div>
    );
};

/**
 * Circle skeleton - for avatars, icons
 */
export const SkeletonCircle: React.FC<{
    size?: number;
    className?: string;
}> = ({ size = 40, className = '' }) => {
    return (
        <Skeleton
            width={size}
            height={size}
            rounded="full"
            className={className}
        />
    );
};

/**
 * Image skeleton - for image placeholders
 */
export const SkeletonImage: React.FC<{
    width?: string | number;
    height?: string | number;
    aspectRatio?: string;
    className?: string;
}> = ({ width = '100%', height, aspectRatio, className = '' }) => {
    const style: React.CSSProperties = {
        width: typeof width === 'number' ? `${width}px` : width,
        height: height ? (typeof height === 'number' ? `${height}px` : height) : undefined,
        aspectRatio: aspectRatio,
    };

    return (
        <div
            className={`bg-slate-200 dark:bg-slate-700 animate-pulse rounded-lg ${className}`}
            style={style}
            aria-hidden="true"
        />
    );
};

export default Skeleton;
