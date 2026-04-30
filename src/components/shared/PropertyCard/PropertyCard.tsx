"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { MapPin, Star, Wifi, Car, Utensils, Coffee } from 'lucide-react';
import { type Property } from '@/types';
import { getCurrencySymbol, convertCurrency } from '@/lib/currency';
import { useUserCurrency } from '@/stores/searchStore';
import SaveButton from '@/components/common/SaveButton';

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
    /** Preload this image (use for first visible card) */
    priority?: boolean;
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
    if (rating >= 9) return 'bg-indigo-600';    // Exceptional - Deep indigo
    if (rating >= 8) return 'bg-blue-600';      // Excellent - Blue
    if (rating >= 7) return 'bg-blue-500';      // Very Good - Light Blue
    if (rating >= 6) return 'bg-slate-500';      // Good - Slate
    return 'bg-amber-500';                       // Average - Warm amber
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
    priority = false,
    index = 0,
    onClick,
    className = '',
}) => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const targetCurrency = useUserCurrency();

    // Use property object values or individual props
    const imgSrc = property?.image || image || '';
    const displayName = property?.name || name || '';
    const displayLocation = property?.location || location || '';
    const displayRating = property?.rating || rating;
    const displayReviews = property?.reviews || reviews;

    // Skip conversion until mounted — EXCHANGE_RATES may differ between server (static)
    // and client (live rates from a previous page visit), causing hydration mismatches.
    const sourceCurrency = property?.currency || 'KRW';
    const rawPrice = property?.price || price || 0;
    const rawOriginalPrice = property?.originalPrice || originalPrice;

    const displayPrice = mounted ? convertCurrency(rawPrice, sourceCurrency, targetCurrency) : rawPrice;
    const displayOriginalPrice = rawOriginalPrice
        ? (mounted ? convertCurrency(rawOriginalPrice, sourceCurrency, targetCurrency) : rawOriginalPrice)
        : undefined;
    const symbol = getCurrencySymbol(mounted ? targetCurrency : sourceCurrency);
    
    const displayBadges = property?.badges || (badge ? [badge] : []);

    const badgeClasses = {
        green: 'bg-gradient-to-r from-green-500 to-emerald-600',
        blue: 'bg-gradient-to-r from-blue-500 to-cyan-600',
        premium: 'bg-gradient-to-r from-amber-500 to-orange-600',
    };

    return (
        <motion.div
            initial={{ opacity: index < 6 ? 0 : 1, y: index < 6 ? 30 : 0 }}
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
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-2xl opacity-0 group-hover:opacity-75 blur-xl transition-all duration-500 group-hover:duration-200" />

            {/* Card content — Airbnb-style size/layout: 4:3 image, rounded corners */}
            <div className="relative bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50 shadow-sm hover:shadow-md dark:shadow-black/20 backdrop-blur-sm transition-shadow h-full flex flex-col">
                <div className="relative aspect-[2/1] sm:aspect-[4/3] overflow-hidden rounded-t-2xl landscape-compact-img landscape-img flex-shrink-0">
                    {imgSrc && (
                        <Image
                            src={imgSrc}
                            alt={displayName}
                            fill
                            sizes="(max-width: 640px) 220px, (max-width: 768px) 260px, 320px"
                            className="object-cover transition-transform duration-500 group-hover:scale-110"
                            priority={priority}
                            loading={priority ? undefined : 'lazy'}
                        />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    {displayBadges.length > 0 && (
                        <motion.div
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: index * 0.1 + 0.3 }}
                            className={`absolute top-1.5 left-1.5 sm:top-3 sm:left-3 px-1.5 py-px sm:px-3 sm:py-1 ${badgeClasses[badgeColor]} text-white text-[9px] sm:text-xs font-medium rounded-full flex items-center gap-0.5 sm:gap-1 shadow-lg landscape-badge`}
                        >
                            {badgeColor === 'blue' && <Star size={10} fill="currentColor" className="flex-shrink-0" />}
                            {displayBadges[0]}
                        </motion.div>
                    )}
                    
                    <div className="absolute top-2 left-2 sm:top-3 sm:left-3 z-10">
                        <SaveButton
                            type="hotel"
                            title={displayName}
                            subtitle={displayLocation}
                            price={rawPrice}
                            currency={sourceCurrency}
                            imageUrl={imgSrc}
                            deepLink={property?.id ? `/property/${property.id}` : '#'}
                            snapshot={property as any}
                            size="sm"
                        />
                    </div>
                </div>

                <div className="p-3 sm:p-4 flex flex-col flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base line-clamp-1 leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {displayName}
                    </h3>
                    <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 min-w-0">
                        <MapPin className="w-3 h-3 text-blue-500 flex-shrink-0" />
                        <span className="truncate">{displayLocation}</span>
                    </p>

                    {/* Tags (optional) */}
                    {includes && includes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                            {includes.slice(0, 2).map((inc) => (
                                <span
                                    key={inc}
                                    className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-md"
                                >
                                    {inc}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Bottom Row: Rating and Price */}
                    <div className="mt-auto pt-3 flex items-center justify-between">
                        {displayRating ? (
                            <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 ${getRatingColor(displayRating)} text-white text-[10px] sm:text-xs font-bold rounded`}>
                                    {displayRating.toFixed(1)}
                                </span>
                                <span className="text-[10px] sm:text-xs font-medium text-slate-700 dark:text-slate-300">
                                    {getRatingLabel(displayRating)}
                                </span>
                            </div>
                        ) : <div />}

                        <div className="text-right">
                            <div className="flex items-baseline gap-1">
                                <span className="text-sm sm:text-lg font-bold text-blue-600 dark:text-blue-400">
                                    {symbol}{displayPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                                    /night
                                </span>
                            </div>
                            {displayOriginalPrice && displayOriginalPrice > displayPrice && (
                                <div className="text-[10px] text-slate-400 line-through leading-none mt-0.5">
                                    {symbol}{displayOriginalPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </div>
                            )}
                        </div>
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
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const targetCurrency = useUserCurrency();
    if (!property) return null;

    // Skip conversion until mounted — EXCHANGE_RATES may differ between server (static)
    // and client (live rates from a previous page visit), causing hydration mismatches.
    const sourceCurrency = property.currency || 'KRW';
    const displayPrice = mounted ? convertCurrency(property.price, sourceCurrency, targetCurrency) : property.price;
    const displayOriginalPrice = property.originalPrice
        ? (mounted ? convertCurrency(property.originalPrice, sourceCurrency, targetCurrency) : property.originalPrice)
        : undefined;
    const symbol = getCurrencySymbol(mounted ? targetCurrency : sourceCurrency);

    // Get star rating from property (1-5 scale hotel stars)
    const hotelStars = Math.min(5, Math.max(1, Math.round((property.rating || 0) / 2)));

    return (
        <motion.div
            initial={{ opacity: index < 6 ? 0 : 1, y: index < 6 ? 30 : 0 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ delay: index * 0.03, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className={`flex flex-col md:flex-row bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 transition-all group cursor-pointer ${className}`}
            onClick={onClick}
        >
            {/* Image Section */}
            <div className="md:w-[240px] relative h-[110px] md:h-auto flex-shrink-0 p-1.5 md:p-3 md:pr-0">
                <div className="absolute inset-2 md:inset-3 md:right-0 rounded-xl overflow-hidden">
                    {property.image && (
                        <Image
                            src={property.image}
                            alt={property.name}
                            fill
                            sizes="240px"
                            className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                        />
                    )}
                </div>
                {/* Heart icon */}
                <div className="absolute top-3 left-3 z-10">
                    <SaveButton
                        type="hotel"
                        title={property.name}
                        subtitle={property.location}
                        price={property.price}
                        currency={property.currency || 'KRW'}
                        imageUrl={property.image}
                        deepLink={`/property/${property.id}`}
                        snapshot={property as any}
                        size="sm"
                    />
                </div>
            </div>

            {/* Content Section */}
            <div className="flex-1 p-2 md:p-4 flex flex-col justify-between">
                <div className="mt-1 md:mt-0">
                    {/* Refundable badge */}
                    {property.refundableTag === 'RFN' && (
                        <span className="inline-flex items-center gap-1 text-[9px] lg:text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded-full mb-1">
                            <svg className="w-2.5 h-2.5 lg:w-3 lg:h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                            Free cancellation
                        </span>
                    )}
                    {/* Hotel Name */}
                    <h3 className="text-[11px] landscape:text-[10px] lg:text-xl font-bold text-slate-900 dark:text-white mb-0.5 md:mb-1 group-hover:text-blue-600 transition-colors line-clamp-1">
                        {property.name}
                    </h3>

                    {/* Location */}
                    <div className="flex items-center text-[9px] landscape:text-[8.5px] lg:text-sm text-slate-500 dark:text-slate-400 mb-1.5 md:mb-4">
                        <MapPin className="w-2 h-2 lg:w-4 lg:h-4 mr-0.5 md:mr-1 shrink-0" />
                        <span className="line-clamp-1">{property.location}</span>
                    </div>
                </div>
                {/* Bottom Row: Rating and Price */}
                <div className="flex items-end justify-between mt-1 md:mt-4">
                    {/* Rating Section */}
                    <div className="flex items-center gap-1.5 md:gap-2">
                        <div className="px-1.5 py-0.5 lg:px-2 lg:py-1 bg-blue-600 text-white text-[9px] landscape:text-[8px] lg:text-sm font-bold rounded-md md:rounded-lg">
                            {property.rating.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </div>
                        <span className="text-[9px] landscape:text-[8px] lg:text-sm font-medium text-slate-700 dark:text-slate-300">
                            {getRatingLabel(property.rating)}
                        </span>
                    </div>

                    {/* Price Section */}
                    <div className="text-right">
                        {displayOriginalPrice && displayOriginalPrice > displayPrice && (
                            <div className="text-[8px] landscape:text-[7px] lg:text-sm text-slate-400 line-through leading-none mb-0.5 md:mb-1">
                                {symbol}{displayOriginalPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                        )}
                        <div className="flex items-baseline gap-1 md:gap-1.5">
                            <span className="text-[12px] landscape:text-[11px] lg:text-2xl font-bold text-blue-600 dark:text-blue-400 leading-none">
                                {symbol}{displayPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                            <span className="text-[8px] landscape:text-[7px] lg:text-sm text-slate-500 dark:text-slate-400">
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
