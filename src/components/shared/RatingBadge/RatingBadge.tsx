import React from 'react';

export type RatingBadgeSize = 'sm' | 'md' | 'lg';
export type RatingBadgeVariant = 'badge' | 'inline' | 'detailed';

export interface RatingBadgeProps {
    /** Rating value (0-10) */
    rating: number;
    /** Number of reviews */
    reviews?: number;
    /** Display size */
    size?: RatingBadgeSize;
    /** Display variant */
    variant?: RatingBadgeVariant;
    /** Show rating label (Exceptional, Excellent, etc.) */
    showLabel?: boolean;
    /** Additional CSS classes */
    className?: string;
}

/**
 * Get rating label based on score
 */
const getRatingLabel = (rating: number): string => {
    if (rating >= 9) return 'Exceptional';
    if (rating >= 8) return 'Excellent';
    if (rating >= 7) return 'Very Good';
    if (rating >= 6) return 'Good';
    return 'Fair';
};

/**
 * Get background color based on rating
 */
const getRatingColor = (rating: number): string => {
    if (rating >= 9) return 'bg-blue-600';
    if (rating >= 8) return 'bg-emerald-500';
    if (rating >= 7) return 'bg-amber-500';
    return 'bg-slate-500';
};

/**
 * Size configurations
 */
const sizeConfig = {
    sm: {
        badge: 'w-6 h-6 text-xs',
        text: 'text-xs',
        reviews: 'text-[10px]',
    },
    md: {
        badge: 'w-8 h-8 text-sm',
        text: 'text-sm',
        reviews: 'text-xs',
    },
    lg: {
        badge: 'w-10 h-10 text-base',
        text: 'text-base',
        reviews: 'text-sm',
    },
};

/**
 * RatingBadge component
 * Displays rating score with optional label and review count
 *
 * @example
 * // Simple badge
 * <RatingBadge rating={9.2} />
 *
 * @example
 * // With reviews and label
 * <RatingBadge rating={9.2} reviews={1234} showLabel />
 *
 * @example
 * // Detailed variant
 * <RatingBadge rating={9.2} reviews={1234} variant="detailed" />
 */
export const RatingBadge: React.FC<RatingBadgeProps> = ({
    rating,
    reviews,
    size = 'md',
    variant = 'badge',
    showLabel = false,
    className = '',
}) => {
    const config = sizeConfig[size];
    const label = getRatingLabel(rating);
    const bgColor = getRatingColor(rating);

    // Simple badge only
    if (variant === 'badge') {
        return (
            <div
                className={`flex items-center justify-center ${config.badge} rounded-lg font-bold text-white ${bgColor} ${className}`}
            >
                {rating}
            </div>
        );
    }

    // Inline with optional label
    if (variant === 'inline') {
        return (
            <div className={`flex items-center gap-2 ${className}`}>
                <span
                    className={`px-2 py-0.5 ${bgColor} text-white ${config.text} font-bold rounded-md shadow-sm`}
                >
                    {rating}
                </span>
                {showLabel && (
                    <span className={`${config.text} font-medium text-slate-700 dark:text-slate-300`}>
                        {label}
                    </span>
                )}
                {reviews !== undefined && (
                    <span className={`${config.reviews} text-slate-500 dark:text-slate-400`}>
                        ({reviews.toLocaleString()} reviews)
                    </span>
                )}
            </div>
        );
    }

    // Detailed variant with stacked layout
    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <div
                className={`flex items-center justify-center ${config.badge} rounded-lg font-bold text-white ${bgColor}`}
            >
                {rating}
            </div>
            <div className="flex flex-col">
                <span className={`${config.text} font-semibold text-slate-900 dark:text-white`}>
                    {label}
                </span>
                {reviews !== undefined && (
                    <span className={`${config.reviews} text-slate-500 dark:text-slate-400`}>
                        {reviews.toLocaleString()} reviews
                    </span>
                )}
            </div>
        </div>
    );
};

export default RatingBadge;
