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
    return 'Good';
};

/**
 * Rating badge color based on score
 */
const getRatingColor = (rating: number): string => {
    if (rating >= 9) return 'bg-blue-600';
    if (rating >= 8) return 'bg-emerald-500';
    return 'bg-slate-500';
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
 * Horizontal card layout (for search results)
 */
const HorizontalCard: React.FC<PropertyCardProps> = ({
    property,
    index = 0,
    onClick,
    className = '',
}) => {
    if (!property) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ delay: index * 0.03, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className={`flex flex-col md:flex-row bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow group cursor-pointer ${className}`}
            onClick={onClick}
        >
            {/* Image Section */}
            <div className="md:w-[320px] relative h-[200px] md:h-auto flex-shrink-0">
                <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                    style={{ backgroundImage: `url(${property.image})` }}
                />
                <div className="absolute top-3 left-3 flex flex-col gap-2">
                    {property.badges.map((badge, i) => (
                        <span
                            key={i}
                            className="px-2 py-1 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-medium rounded-full shadow-sm"
                        >
                            {badge}
                        </span>
                    ))}
                </div>
            </div>

            {/* Content Section */}
            <div className="flex-1 p-5 flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white mb-1 group-hover:text-blue-600 transition-colors">
                                {property.name}
                            </h3>
                            <div className="flex items-center text-sm text-slate-500 dark:text-slate-400">
                                <MapPin size={14} className="mr-1" />
                                {property.location}
                            </div>
                        </div>
                    </div>

                    <div className="mb-4">
                        <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 mb-3">
                            {property.description}
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            {property.amenities.slice(0, 4).map((amenity, i) => (
                                <div key={i} className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                                    <AmenityIcon amenity={amenity} />
                                    <span>{amenity}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white ${getRatingColor(property.rating)}`}>
                            {property.rating}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                {getRatingLabel(property.rating)}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                {property.reviews.toLocaleString()} reviews
                            </span>
                        </div>
                    </div>
                </div>

                {/* Price Section */}
                <div className="flex flex-col justify-end md:items-end md:border-l md:border-slate-100 md:dark:border-white/5 md:pl-4 mt-4 md:mt-0 min-w-[140px]">
                    {property.originalPrice && (
                        <div className="flex items-center gap-2 mb-1">
                            <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold px-2 py-0.5 rounded">
                                Save {Math.round((1 - property.price / property.originalPrice) * 100)}%
                            </span>
                            <span className="text-xs text-slate-400 line-through">
                                ₱{property.originalPrice.toLocaleString()}
                            </span>
                        </div>
                    )}

                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                        ₱{property.price.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                        includes taxes & fees
                    </div>

                    <button className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors text-sm">
                        View Availability
                    </button>

                    <div className="mt-2 text-center">
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            Free Cancellation
                        </span>
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
