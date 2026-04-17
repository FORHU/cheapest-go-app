import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Star, MapPin, Globe, Phone, Clock, User, Quote } from 'lucide-react';

interface Review {
    author_name: string;
    profile_photo_url?: string;
    rating: number;
    relative_time_description: string;
    text: string;
    time: number;
}

interface PoiDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    poi: any;
}

export function PoiDetailsModal({ isOpen, onClose, poi }: PoiDetailsModalProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!isOpen || !poi || !mounted) return null;

    // Extract properties safely (handles both GeoJSON Features and legacy objects)
    const props = poi.properties || poi;
    const name = props.name || 'Location Details';
    const category = props.category || 'Point of Interest';
    const rating = props.rating;
    const userRatingsTotal = props.userRatingsTotal || 0;
    const imageUrl = props.imageUrl || poi.imageUrl;
    const reviews = props.reviews || poi.reviews || [];
    const phone = props.phone || poi.phone;
    const website = props.website || poi.website;
    const icon = props.icon || poi.icon;

    // Extract coordinates safely
    const coords = poi.geometry?.coordinates 
        ? { lat: poi.geometry.coordinates[1], lng: poi.geometry.coordinates[0] }
        : poi.coordinates;

    const hasReviews = reviews && reviews.length > 0;
    const CategoryIcon = icon || MapPin;

    const modalContent = (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl rounded-2xl border border-slate-200 dark:border-slate-800 z-[10000] overflow-hidden flex flex-col max-h-[85vh]">
                    <h2 className="sr-only">{name} Details</h2>
                    
                    {/* Header Image */}
                    <div className="relative h-48 sm:h-56 w-full shrink-0 bg-slate-100 dark:bg-slate-800">
                        {/* Image Fallback Background */}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/40 to-transparent z-10" />
                        
                        {imageUrl && (
                            <div 
                                className="absolute inset-0 bg-cover bg-center"
                                style={{ backgroundImage: `url(${imageUrl})` }}
                            />
                        )}
                    
                    <button 
                        onClick={onClose}
                        className="absolute top-4 right-4 z-20 w-8 h-8 flex items-center justify-center bg-black/30 hover:bg-black/50 backdrop-blur-md rounded-full text-white transition-all"
                    >
                        <X size={18} />
                    </button>

                    {/* Header Info superimposed */}
                        <div className="absolute bottom-0 left-0 right-0 p-5 z-20 text-white">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="flex items-center gap-1.5 px-2.5 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-medium">
                                    <CategoryIcon size={12} />
                                    {category}
                                </span>
                            </div>
                            <h2 className="text-2xl font-bold leading-tight mb-1">{name}</h2>
                            {typeof rating === 'number' && (
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center text-amber-400">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <Star key={i} size={14} className={i < Math.round(rating) ? 'fill-current' : 'text-white/30'} />
                                        ))}
                                    </div>
                                    <span className="font-bold text-sm">{rating.toFixed(1)}</span>
                                    <span className="text-white/70 text-xs">({userRatingsTotal} reviews)</span>
                                </div>
                            )}
                        </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                    
                    {/* Action Row */}
                    <div className="flex flex-wrap gap-2 mb-6">
                        {phone && (
                            <a href={`tel:${phone}`} className="flex-1 flex items-center justify-center gap-2 p-2.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl transition-colors text-sm font-semibold">
                                <Phone size={16} /> Call
                            </a>
                        )}
                        {website && (
                            <a href={website} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 p-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-colors text-sm font-semibold">
                                <Globe size={16} /> Website
                            </a>
                        )}
                        {coords ? (
                            <a href={`https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 p-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-colors text-sm font-semibold">
                                <MapPin size={16} /> Directions
                            </a>
                        ) : (
                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 p-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-colors text-sm font-semibold">
                                <MapPin size={16} /> Directions
                            </a>
                        )}
                    </div>

                    {/* Detailed Reviews */}
                    {hasReviews ? (
                        <div className="space-y-4">
                            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <Quote size={18} className="text-slate-400" />
                                Top Google Reviews
                            </h3>
                            <div className="grid gap-4">
                                {reviews.map((r: Review, idx: number) => (
                                    <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                {r.profile_photo_url ? (
                                                    <img src={r.profile_photo_url} alt="" className="w-8 h-8 rounded-full" />
                                                ) : (
                                                    <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-slate-500">
                                                        <User size={14} />
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="text-xs font-semibold text-slate-900 dark:text-white">{r.author_name}</p>
                                                    <p className="text-[10px] text-slate-500">{r.relative_time_description}</p>
                                                </div>
                                            </div>
                                            <div className="flex text-amber-400">
                                                {Array.from({ length: 5 }).map((_, i) => (
                                                    <Star key={i} size={10} className={i < r.rating ? 'fill-current' : 'text-slate-300 dark:text-slate-600'} />
                                                ))}
                                            </div>
                                        </div>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed italic">
                                            "{r.text}"
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Star className="text-slate-400" size={20} />
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400">No direct reviews available for this place yet.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
