"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Star, Wifi, Car, Utensils, Coffee } from 'lucide-react';
import { Property } from '@/data/mockProperties';

/**
 * Unified PropertyCard component variants
 */
export type PropertyCardVariant = 'vertical' | 'horizontal' | 'compact';

/**
 * Props for the unified PropertyCard component
 */
export interface PropertyCardProps {
    /** Property data object */
    property?: Property;
    /** Layout variant */
    variant?: PropertyCardVariant;
    /** Animation index for staggered animations */
    index?: number;
    /** Click handler */
    onClick?: () => void;
    /** Additional CSS classes */
    className?: string;

    // Alternative props for simple usage (backward compatible with ui/PropertyCard)
    /** Image URL (alternative to property.image) */
    image?: string;
    /** Property name (alternative to property.name) */
    name?: string;
    /** Location text (alternative to property.location) */
    location?: string;
    /** Rating value (alternative to property.rating) */
    rating?: number;
    /** Review count (alternative to property.reviews) */
    reviews?: number;
    /** Current price (alternative to property.price) */
    price?: number;
    /** Original price for discount display */
    originalPrice?: number;
    /** Badge text */
    badge?: string;
    /** Badge color variant */
    badgeColor?: 'green' | 'blue' | 'premium';
    /** Included items list */
    includes?: string[];
    /** Price label suffix */
    priceLabel?: string;
}

/**
 * Amenity icon mapping
 */
const AmenityIcon: React.FC<{ amenity: string }> = ({ amenity }) => {
    const iconProps = { size: 12, className: "mr-1.5" };

    if (amenity.toLowerCase().includes('wifi')) return <Wifi {...iconProps} />;
    if (amenity.toLowerCase().includes('parking')) return <Car {...iconProps} />;
    if (amenity.toLowerCase().includes('restaurant')) return <Utensils {...iconProps} />;
    if (amenity.toLowerCase().includes('breakfast')) return <Coffee {...iconProps} />;

    return null;
};

/**
 * Rating label based on score
 */
const getRatingLabel = (rating: number): string => {
    if (rating >= 9) return 'Exceptional';
    if (rating >= 8) return 'Excellent';
    if (rating >= 7) return 'Very Good';
    if (rating >= 6) return 'Good';
    return 'Average';
};

/**
 * Rating badge color based on score - distinct colors for each level
 */
const getRatingColor = (rating: number): string => {
    if (rating >= 9) return 'bg-indigo-600';    // Exceptional - Deep indigo/purple
    if (rating >= 8) return 'bg-emerald-500';   // Excellent - Vibrant green
    if (rating >= 7) return 'bg-teal-500';      // Very Good - Teal
    if (rating >= 6) return 'bg-blue-500';      // Good - Blue
    return 'bg-amber-500';                       // Average - Warm amber/orange
};

/**
 * Strip HTML tags from text
 */
const stripHtml = (html: string): string => {
    if (!html) return '';
    let text = html.replace(/<br\s*\/?>/gi, ' ');
    text = text.replace(/<\/p>/gi, ' ');
    text = text.replace(/<[^>]*>/g, '');
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
};

/**
 * Vertical card layout (for landing page grids)
 */
const VerticalCard: React.FC<PropertyCardProps> = ({
    property,
    image,
    name,
    location,
    rating,
    reviews,
    price,
    originalPrice,
    badge,
    badgeColor = 'green',
    includes,
    priceLabel,
    index = 0,
    onClick,
    className = '',
}) => {
    // Use property object values or individual props
    const imgSrc = property?.image || image || '';
    const displayName = property?.name || name || '';
    const displayLocation = property?.location || location || '';
    const displayRating = property?.rating || rating;
    const displayReviews = property?.reviews || reviews;
    const displayPrice = property?.price || price || 0;
    const displayOriginalPrice = property?.originalPrice || originalPrice;
    const displayBadges = property?.badges || (badge ? [badge] : []);

    const badgeClasses = {
        green: 'bg-gradient-to-r from-green-500 to-emerald-600',
        blue: 'bg-gradient-to-r from-blue-500 to-cyan-600',
        premium: 'bg-gradient-to-r from-amber-500 to-orange-600',
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{
                delay: index * 0.1,
                type: 'spring',
                stiffness: 100,
                damping: 15
            }}
            whileHover={{ y: -8, scale: 1.02 }}
            onClick={onClick}
            className={`relative group cursor-pointer ${className}`}
        >
            {/* Glow effect on hover */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-xl opacity-0 group-hover:opacity-75 blur-xl transition-all duration-500 group-hover:duration-200" />

            {/* Card content — Airbnb-style size/layout: 4:3 image, rounded corners */}
            <div className="relative bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50 shadow-sm hover:shadow-md dark:shadow-black/20 backdrop-blur-sm transition-shadow">
                <div className="relative aspect-[4/3] overflow-hidden rounded-t-xl">
                    <motion.div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${imgSrc})` }}
                        whileHover={{ scale: 1.1 }}
                        transition={{ duration: 0.6 }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                    {displayBadges.length > 0 && (
                        <motion.div
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: index * 0.1 + 0.3 }}
                            className={`absolute top-2 left-2 sm:top-3 sm:left-3 px-2 py-0.5 sm:px-3 sm:py-1 ${badgeClasses[badgeColor]} text-white text-[clamp(0.625rem,1.25vw,0.75rem)] font-medium rounded-full flex items-center gap-1 shadow-lg`}
                        >
                            {badgeColor === 'blue' && <Star size={10} fill="currentColor" className="flex-shrink-0" />}
                            {displayBadges[0]}
                        </motion.div>
                    )}
                </div>

                <div className="p-2.5 sm:p-3 md:p-4 min-h-[155px] sm:min-h-[168px] flex flex-col">
                    <h3 className="font-semibold text-slate-900 dark:text-white text-[clamp(0.8125rem,1.5vw,0.875rem)] line-clamp-2 min-h-[2.5em] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {displayName}
                    </h3>
                    <p className="text-[clamp(0.6875rem,1.25vw,0.75rem)] text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 flex items-center gap-1 min-w-0">
                        <MapPin className="w-3 h-3 sm:w-[12px] sm:h-[12px] text-blue-500 flex-shrink-0" />
                        <span className="truncate">{displayLocation}</span>
                    </p>

                    {displayRating && (
                        <div className="flex items-center gap-1.5 sm:gap-2 mt-1.5 sm:mt-2 flex-wrap min-h-[1.5rem]">
                            <span className="px-1.5 py-0.5 sm:px-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-[clamp(0.625rem,1.25vw,0.75rem)] font-bold rounded-md shadow-sm">
                                {displayRating}
                            </span>
                            {displayReviews && (
                                <span className="text-[clamp(0.625rem,1.25vw,0.75rem)] text-slate-500 dark:text-slate-400">
                                    ({displayReviews.toLocaleString()} reviews)
                                </span>
                            )}
                        </div>
                    )}
                    {!displayRating && <div className="min-h-[1.5rem]" aria-hidden />}

                    {/* Includes/tags — fixed height so cards with 1 or 2 lines of tags stay same size */}
                    {includes && includes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5 sm:mt-2 min-h-[2.75rem] content-start">
                            {includes.map((inc) => (
                                <span
                                    key={inc}
                                    className="text-[clamp(0.625rem,1.25vw,0.75rem)] bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 text-green-600 dark:text-green-400 px-1.5 py-0.5 sm:px-2 rounded-full border border-green-200 dark:border-green-800"
                                >
                                    {inc}
                                </span>
                            ))}
                        </div>
                    )}
                    {(!includes || includes.length === 0) && <div className="min-h-[2.75rem]" aria-hidden />}

                    <div className="mt-auto pt-2 sm:pt-3 flex items-baseline gap-1.5 sm:gap-2 flex-wrap">
                        {displayOriginalPrice && (
                            <span className="text-[clamp(0.625rem,1.25vw,0.75rem)] text-slate-400 line-through">
                                ₱{displayOriginalPrice.toLocaleString()}
                            </span>
                        )}
                        <span className="text-[clamp(0.9375rem,2vw,1.125rem)] font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                            ₱{displayPrice.toLocaleString()}
                            {priceLabel && (
                                <span className="font-normal text-slate-500 text-[clamp(0.75rem,1.5vw,0.875rem)]">
                                    {priceLabel}
                                </span>
                            )}
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

/**
 * Horizontal card layout (for search results) - LiteAPI Sandbox Style
 */
const HorizontalCard: React.FC<PropertyCardProps> = ({
    property,
    index = 0,
    onClick,
    className = '',
}) => {
    if (!property) return null;

    // Get star rating from property (1-5 scale hotel stars)
    const hotelStars = Math.min(5, Math.max(1, Math.round((property.rating || 0) / 2)));

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ delay: index * 0.03, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className={`flex flex-col md:flex-row bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 transition-all group cursor-pointer ${className}`}
            onClick={onClick}
        >
            {/* Image Section */}
            <div className="md:w-[140px] relative h-[120px] md:h-auto flex-shrink-0 p-2 md:p-3 md:pr-0">
                <div
                    className="absolute inset-2 md:inset-3 md:right-0 bg-cover bg-center rounded-xl transition-transform duration-500 group-hover:scale-105"
                    style={{ backgroundImage: `url(${property.image})` }}
                />
                {/* Heart icon */}
                <button
                    className="absolute top-3 left-3 w-10 h-10 rounded-full bg-white/90 dark:bg-slate-800/90 flex items-center justify-center hover:bg-white dark:hover:bg-slate-700 transition-colors shadow-sm"
                    onClick={(e) => e.stopPropagation()}
                >
                    <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                </button>
            </div>

            {/* Content Section */}
            <div className="flex-1 p-2 flex flex-col justify-between">
                <div>
                    {/* Hotel Name */}
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-0.5 group-hover:text-blue-600 transition-colors line-clamp-1">
                        {property.name}
                    </h3>

                    {/* Location */}
                    <div className="flex items-center text-[10px] text-slate-500 dark:text-slate-400 mb-2">
                        <MapPin size={10} className="mr-0.5 shrink-0" />
                        <span className="line-clamp-1">{property.location}</span>
                    </div>
                </div>
                {/* Bottom Row: Rating and Price */}
                <div className="flex items-end justify-between mt-1">
                    {/* Rating Section */}
                    <div className="flex items-center gap-1.5">
                        <div className="px-1.5 py-0.5 bg-blue-600 text-white text-[11px] font-bold rounded-md">
                            {property.rating.toFixed(1)}
                        </div>
                        <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                            {getRatingLabel(property.rating)}
                        </span>
                    </div>

                    {/* Price Section */}
                    <div className="text-right">
                        {property.originalPrice && property.originalPrice > property.price && (
                            <div className="text-[10px] text-slate-400 line-through leading-none mb-0.5">
                                ₱{property.originalPrice.toLocaleString()}
                            </div>
                        )}
                        <div className="flex items-baseline gap-1">
                            <span className="text-[15px] font-bold text-blue-600 dark:text-blue-400 leading-none">
                                ₱{property.price.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                /night
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};



/**
 * Unified PropertyCard component
 * Supports multiple layout variants for different use cases
 *
 * @example
 * // Vertical card (landing page)
 * <PropertyCard
 *   variant="vertical"
 *   image="/hotel.jpg"
 *   name="Grand Hotel"
 *   location="Manila"
 *   price={5000}
 *   rating={9.2}
 * />
 *
 * @example
 * // Horizontal card (search results)
 * <PropertyCard
 *   variant="horizontal"
 *   property={propertyData}
 *   onClick={() => router.push(`/property/${property.id}`)}
 * />
 */
export const PropertyCard: React.FC<PropertyCardProps> = (props) => {
    const { variant = 'vertical' } = props;

    switch (variant) {
        case 'horizontal':
            return <HorizontalCard {...props} />;
        case 'compact':
        case 'vertical':
        default:
            return <VerticalCard {...props} />;
    }
};

export default PropertyCard;
