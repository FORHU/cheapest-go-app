import React from 'react';
import {
    Wifi,
    Car,
    Utensils,
    Coffee,
    Tv,
    Wind,
    Bath,
    Dumbbell,
    Waves,
    UtensilsCrossed,
    BedDouble,
    Phone,
    Shield,
    Snowflake,
    Cigarette,
    PawPrint,
    Accessibility,
    Sparkles,
    Check,
} from 'lucide-react';

export type AmenitiesVariant = 'compact' | 'detailed' | 'grid' | 'inline';

export interface AmenitiesListProps {
    /** List of amenity names or objects */
    amenities: (string | { name: string; icon?: string })[];
    /** Maximum number of amenities to display */
    maxVisible?: number;
    /** Show icons alongside text */
    showIcons?: boolean;
    /** Display variant */
    variant?: AmenitiesVariant;
    /** Additional CSS classes */
    className?: string;
}

/**
 * Icon mapping for common amenities
 */
const getAmenityIcon = (amenity: string): React.ReactNode => {
    const lowerAmenity = amenity.toLowerCase();
    const iconProps = { size: 14, className: "flex-shrink-0" };

    // WiFi related
    if (lowerAmenity.includes('wifi') || lowerAmenity.includes('internet')) {
        return <Wifi {...iconProps} />;
    }
    // Parking
    if (lowerAmenity.includes('parking')) {
        return <Car {...iconProps} />;
    }
    // Restaurant/Dining
    if (lowerAmenity.includes('restaurant') || lowerAmenity.includes('dining')) {
        return <Utensils {...iconProps} />;
    }
    // Breakfast
    if (lowerAmenity.includes('breakfast')) {
        return <Coffee {...iconProps} />;
    }
    // TV
    if (lowerAmenity.includes('tv') || lowerAmenity.includes('television')) {
        return <Tv {...iconProps} />;
    }
    // Air conditioning
    if (lowerAmenity.includes('air') || lowerAmenity.includes('ac') || lowerAmenity.includes('conditioning')) {
        return <Snowflake {...iconProps} />;
    }
    // Bathroom
    if (lowerAmenity.includes('bath') || lowerAmenity.includes('shower')) {
        return <Bath {...iconProps} />;
    }
    // Gym/Fitness
    if (lowerAmenity.includes('gym') || lowerAmenity.includes('fitness')) {
        return <Dumbbell {...iconProps} />;
    }
    // Pool/Spa
    if (lowerAmenity.includes('pool') || lowerAmenity.includes('spa')) {
        return <Waves {...iconProps} />;
    }
    // Room service
    if (lowerAmenity.includes('room service')) {
        return <UtensilsCrossed {...iconProps} />;
    }
    // Bed
    if (lowerAmenity.includes('bed') || lowerAmenity.includes('king') || lowerAmenity.includes('queen')) {
        return <BedDouble {...iconProps} />;
    }
    // Phone
    if (lowerAmenity.includes('phone') || lowerAmenity.includes('telephone')) {
        return <Phone {...iconProps} />;
    }
    // Safe/Security
    if (lowerAmenity.includes('safe') || lowerAmenity.includes('security')) {
        return <Shield {...iconProps} />;
    }
    // Smoking
    if (lowerAmenity.includes('smoking') || lowerAmenity.includes('non-smoking')) {
        return <Cigarette {...iconProps} />;
    }
    // Pet friendly
    if (lowerAmenity.includes('pet')) {
        return <PawPrint {...iconProps} />;
    }
    // Accessibility
    if (lowerAmenity.includes('accessible') || lowerAmenity.includes('wheelchair')) {
        return <Accessibility {...iconProps} />;
    }
    // Cleaning
    if (lowerAmenity.includes('clean') || lowerAmenity.includes('housekeeping')) {
        return <Sparkles {...iconProps} />;
    }

    // Default check icon
    return <Check {...iconProps} />;
};

/**
 * Get amenity name from string or object
 */
const getAmenityName = (amenity: string | { name: string }): string => {
    return typeof amenity === 'string' ? amenity : amenity.name;
};

/**
 * AmenitiesList component
 * Displays a list of amenities with optional icons
 *
 * @example
 * // Simple inline list
 * <AmenitiesList
 *   amenities={['Free WiFi', 'Parking', 'Pool']}
 *   variant="inline"
 * />
 *
 * @example
 * // Grid with icons
 * <AmenitiesList
 *   amenities={['Free WiFi', 'Parking', 'Pool', 'Gym']}
 *   variant="grid"
 *   showIcons
 * />
 *
 * @example
 * // Limited display with "more" indicator
 * <AmenitiesList
 *   amenities={longAmenitiesList}
 *   maxVisible={4}
 *   showIcons
 * />
 */
export const AmenitiesList: React.FC<AmenitiesListProps> = ({
    amenities,
    maxVisible,
    showIcons = true,
    variant = 'compact',
    className = '',
}) => {
    const visibleAmenities = maxVisible ? amenities.slice(0, maxVisible) : amenities;
    const remainingCount = maxVisible ? Math.max(0, amenities.length - maxVisible) : 0;

    // Compact variant - small tags
    if (variant === 'compact') {
        return (
            <div className={`flex flex-wrap gap-1 ${className}`}>
                {visibleAmenities.map((amenity, i) => {
                    const name = getAmenityName(amenity);
                    return (
                        <span
                            key={i}
                            className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full"
                        >
                            {showIcons && getAmenityIcon(name)}
                            {name}
                        </span>
                    );
                })}
                {remainingCount > 0 && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 px-2 py-0.5">
                        +{remainingCount} more
                    </span>
                )}
            </div>
        );
    }

    // Inline variant - horizontal list with icons
    if (variant === 'inline') {
        return (
            <div className={`flex flex-wrap gap-x-4 gap-y-2 ${className}`}>
                {visibleAmenities.map((amenity, i) => {
                    const name = getAmenityName(amenity);
                    return (
                        <div
                            key={i}
                            className="flex items-center text-xs text-slate-500 dark:text-slate-400"
                        >
                            {showIcons && (
                                <span className="mr-1.5 text-slate-400 dark:text-slate-500">
                                    {getAmenityIcon(name)}
                                </span>
                            )}
                            <span>{name}</span>
                        </div>
                    );
                })}
                {remainingCount > 0 && (
                    <span className="text-xs text-blue-600 dark:text-blue-400">
                        +{remainingCount} more
                    </span>
                )}
            </div>
        );
    }

    // Grid variant - 2-column grid
    if (variant === 'grid') {
        return (
            <div className={`grid grid-cols-2 gap-2 ${className}`}>
                {visibleAmenities.map((amenity, i) => {
                    const name = getAmenityName(amenity);
                    return (
                        <div
                            key={i}
                            className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
                        >
                            {showIcons && (
                                <span className="text-emerald-500">
                                    {getAmenityIcon(name)}
                                </span>
                            )}
                            <span>{name}</span>
                        </div>
                    );
                })}
                {remainingCount > 0 && (
                    <div className="col-span-2 text-sm text-blue-600 dark:text-blue-400">
                        +{remainingCount} more amenities
                    </div>
                )}
            </div>
        );
    }

    // Detailed variant - vertical list with descriptions
    return (
        <div className={`space-y-3 ${className}`}>
            {visibleAmenities.map((amenity, i) => {
                const name = getAmenityName(amenity);
                return (
                    <div
                        key={i}
                        className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg"
                    >
                        {showIcons && (
                            <span className="text-emerald-500 mt-0.5">
                                {getAmenityIcon(name)}
                            </span>
                        )}
                        <div>
                            <span className="text-sm font-medium text-slate-900 dark:text-white">
                                {name}
                            </span>
                        </div>
                    </div>
                );
            })}
            {remainingCount > 0 && (
                <button className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                    Show all {amenities.length} amenities
                </button>
            )}
        </div>
    );
};

export default AmenitiesList;
