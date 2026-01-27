"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { Star, MapPin, Coffee, Wifi, Car, Utensils } from 'lucide-react';
import { Property } from '@/data/mockProperties';
import { Badge, PriceDisplay } from '@/components/ui';

interface PropertyCardProps {
    property: Property;
    index: number;
}

const PropertyCard: React.FC<PropertyCardProps> = ({ property, index }) => {
    const router = useRouter();
    const searchParams = useSearchParams();

    const handleViewProperty = () => {
        const currentParams = new URLSearchParams(searchParams.toString());
        router.push(`/property/${property.id}?${currentParams.toString()}`);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ delay: index * 0.03, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-col md:flex-row bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow group cursor-pointer"
            onClick={handleViewProperty}
        >
            {/* Image Section */}
            <div className="md:w-[320px] relative h-[200px] md:h-auto flex-shrink-0">
                <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                    style={{ backgroundImage: `url(${property.image})` }}
                />

                {/* Badges Overlay */}
                <div className="absolute top-3 left-3 flex flex-col gap-2">
                    {property.badges.map((badge, i) => (
                        <Badge key={i} variant="premium" className="shadow-sm">{badge}</Badge>
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
                                <span className="mx-2 text-slate-300 dark:text-slate-600">|</span>
                                <span className="text-blue-600 hover:underline z-10" onClick={(e) => e.stopPropagation()}>View on map</span>
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
                                    {amenity === 'Free WiFi' && <Wifi size={12} className="mr-1.5" />}
                                    {amenity === 'Parking' && <Car size={12} className="mr-1.5" />}
                                    {amenity === 'Restaurant' && <Utensils size={12} className="mr-1.5" />}
                                    {amenity === 'Breakfast included' && <Coffee size={12} className="mr-1.5" />}
                                    <span>{amenity}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold text-white
                            ${property.rating >= 9 ? 'bg-blue-600' : property.rating >= 8 ? 'bg-emerald-500' : 'bg-slate-500'}`}>
                            {property.rating}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                {property.rating >= 9 ? 'Exceptional' : property.rating >= 8 ? 'Excellent' : 'Very Good'}
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

export default PropertyCard;
