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

            {/* Card content */}
            <div className="relative bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50 shadow-lg dark:shadow-black/20 backdrop-blur-sm">
                <div className="relative h-40 overflow-hidden">
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
                            className={`absolute top-3 left-3 px-3 py-1 ${badgeClasses[badgeColor]} text-white text-xs font-medium rounded-full flex items-center gap-1 shadow-lg`}
                        >
                            {badgeColor === 'blue' && <Star size={10} fill="currentColor" />}
                            {displayBadges[0]}
                        </motion.div>
                    )}
                </div>

                <div className="p-4">
                    <h3 className="font-semibold text-slate-900 dark:text-white text-sm line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {displayName}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                        <MapPin size={12} className="text-blue-500" />
                        {displayLocation}
                    </p>

                    {displayRating && (
                        <div className="flex items-center gap-2 mt-2">
                            <span className="px-2 py-0.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs font-bold rounded-md shadow-sm">
                                {displayRating}
                            </span>
                            {displayReviews && (
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                    ({displayReviews.toLocaleString()} reviews)
                                </span>
                            )}
                        </div>
                    )}

                    {includes && includes.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                            {includes.map((inc) => (
                                <span
                                    key={inc}
                                    className="text-xs bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800"
                                >
                                    {inc}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="mt-3 flex items-baseline gap-2">
                        {displayOriginalPrice && (
                            <span className="text-xs text-slate-400 line-through">
                                ₱{displayOriginalPrice.toLocaleString()}
                            </span>
                        )}
                        <span className="text-lg font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                            ₱{displayPrice.toLocaleString()}
                            {priceLabel && (
                                <span className="font-normal text-slate-500 text-sm">
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
            className={`flex flex-col md:flex-row bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 transition-all group cursor-pointer ${className}`}
            onClick={onClick}
        >
            {/* Image Section */}
            <div className="md:w-[280px] relative h-[200px] md:h-[220px] flex-shrink-0">
                <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                    style={{ backgroundImage: `url(${property.image})` }}
                />
                {/* Heart icon */}
                <button
                    className="absolute top-3 left-3 w-8 h-8 rounded-full bg-white/90 dark:bg-slate-800/90 flex items-center justify-center hover:bg-white dark:hover:bg-slate-700 transition-colors shadow-sm"
                    onClick={(e) => e.stopPropagation()}
                >
                    <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                </button>
            </div>

            {/* Content Section */}
            <div className="flex-1 p-4 flex flex-col">
                {/* Star Rating */}
                <div className="flex items-center gap-0.5 mb-2">
                    {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                            key={s}
                            size={14}
                            className={s <= hotelStars
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-slate-200 dark:text-slate-600"
                            }
                        />
                    ))}
                </div>

                {/* Hotel Name */}
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 group-hover:text-blue-600 transition-colors line-clamp-1">
                    {property.name}
                </h3>

                {/* Location */}
                <div className="flex items-center text-sm text-blue-600 dark:text-blue-400 mb-1">
                    <MapPin size={14} className="mr-1 shrink-0" />
                    <span className="line-clamp-1">{property.location}</span>
                </div>

                {/* Distance from centre */}
                {property.distance && (
                    <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 mb-2">
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        {property.distance} from centre
                    </div>
                )}

                {/* Free cancellation / Breakfast tags — these are hotel-level aggregates */}
                {/* "on select rooms" qualifier since not all rooms may qualify */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                    {property.refundableTag === 'RFN' && (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Free cancellation on select rooms
                        </span>
                    )}
                    {/* Show breakfast from boardTypes (LiteAPI rates) or amenities as fallback */}
                    {(property.boardTypes?.some((b: string) => b.toLowerCase().includes('breakfast')) ||
                      property.amenities.some((a: string) => a.toLowerCase().includes('breakfast'))) && (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Breakfast option available
                        </span>
                    )}
                </div>

                {/* Amenity Badges */}
                <div className="flex flex-wrap gap-1.5 mt-auto">
                    {property.amenities.filter((a: string) => !a.toLowerCase().includes('breakfast')).slice(0, 3).map((amenity, i) => (
                        <span
                            key={i}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-600 dark:text-slate-300"
                        >
                            <AmenityIcon amenity={amenity} />
                            {amenity}
                        </span>
                    ))}
                </div>
            </div>

            {/* Right Section - Rating & Price */}
            <div className="flex flex-col md:w-[180px] p-4 md:border-l border-t md:border-t-0 border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                {/* Rating Section */}
                <div className="flex items-start justify-between md:justify-end gap-2 mb-4">
                    <div className="text-right">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">
                            {getRatingLabel(property.rating)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                            {property.reviews > 0 ? `${property.reviews.toLocaleString()} reviews` : ''}
                        </div>
                    </div>
                    <div className={`flex items-center justify-center w-9 h-9 rounded-lg text-sm font-bold text-white ${getRatingColor(property.rating)}`}>
                        {property.rating.toFixed(1)}
                    </div>
                </div>

                {/* Discount Badge */}
                {property.originalPrice && property.originalPrice > property.price && (
                    <div className="flex justify-end mb-2">
                        <span className="bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                            {Math.round((1 - property.price / property.originalPrice) * 100)}% off
                        </span>
                    </div>
                )}

                {/* Price */}
                <div className="text-right mb-1">
                    {property.originalPrice && property.originalPrice > property.price && (
                        <span className="text-sm text-slate-400 line-through mr-2">
                            ₱{property.originalPrice.toLocaleString()}
                        </span>
                    )}
                    <span className="text-xl font-bold text-slate-900 dark:text-white">
                        ₱{property.price.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400"> / night</span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 text-right mb-4">
                    includes taxes & fees
                </div>

                {/* CTA Button */}
                <button className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-sm flex items-center justify-center gap-1">
                    See availability
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
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
