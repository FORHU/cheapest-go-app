import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Star, MapPin, Globe, Phone, Clock, User, Quote, Camera, Image as ImageIcon, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

interface Review {
    author_name: string;
    profile_photo_url?: string;
    rating: number;
    relative_time_description: string;
    text: string;
    time: number;
}

function groupOpeningHours(weekdayText: string[]) {
    if (!weekdayText || !Array.isArray(weekdayText) || weekdayText.length === 0) return [];
    
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    const parsed = weekdayText.map(text => {
        // Google uses ": " or " :"
        const match = text.match(/^(.+?):\s*(.+)$/);
        if (match) {
            return { day: match[1].trim(), hours: match[2].trim(), original: text };
        }
        return { day: text, hours: '', original: text };
    });

    const grouped = [];
    let currentGroup = { 
        startDay: parsed[0].day, 
        endDay: parsed[0].day, 
        hours: parsed[0].hours,
        daysIncluded: [parsed[0].day]
    };

    for (let i = 1; i < parsed.length; i++) {
        if (parsed[i].hours === currentGroup.hours && parsed[i].hours !== '') {
            currentGroup.endDay = parsed[i].day;
            currentGroup.daysIncluded.push(parsed[i].day);
        } else {
            grouped.push(currentGroup);
            currentGroup = { 
                startDay: parsed[i].day, 
                endDay: parsed[i].day, 
                hours: parsed[i].hours,
                daysIncluded: [parsed[i].day]
            };
        }
    }
    grouped.push(currentGroup);

    return grouped.map(g => {
        const includesToday = g.daysIncluded.some(d => d.toLowerCase() === todayName.toLowerCase());
        const displayText = g.startDay === g.endDay 
            ? `${g.startDay}: ${g.hours}` 
            : `${g.startDay} - ${g.endDay}: ${g.hours}`;
        return { text: displayText, includesToday };
    });
}

function ReviewCard({ review }: { review: Review }) {
    return (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {review.profile_photo_url ? (
                        <img src={review.profile_photo_url} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                        <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-slate-500">
                            <User size={14} />
                        </div>
                    )}
                    <div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">{review.author_name}</p>
                        <p className="text-[10px] text-slate-500">{review.relative_time_description}</p>
                    </div>
                </div>
                <div className="flex text-blue-500">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} size={10} className={i < review.rating ? 'fill-current' : 'text-blue-200 dark:text-blue-900/40'} />
                    ))}
                </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed italic">
                &ldquo;{review.text}&rdquo;
            </p>
        </div>
    );
}

interface PoiDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    poi: any;
}

export function PoiDetailsModal({ isOpen, onClose, poi }: PoiDetailsModalProps) {
    const [mounted, setMounted] = useState(false);
    const [userReviews, setUserReviews] = useState<Review[]>([]);
    const [isAddingReview, setIsAddingReview] = useState(false);
    const [newRating, setNewRating] = useState(5);
    const [newComment, setNewComment] = useState('');
    const [userImages, setUserImages] = useState<string[]>([]);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Load persisted reviews and images from localStorage
    const poiId = poi?.properties?.id || poi?.id;
    useEffect(() => {
        if (mounted && poiId) {
            // Load reviews
            const savedReviews = localStorage.getItem(`poi-reviews-${poiId}`);
            if (savedReviews) {
                try {
                    setUserReviews(JSON.parse(savedReviews));
                } catch (e) {
                    console.error('Failed to parse saved reviews', e);
                }
            } else {
                setUserReviews([]);
            }

            // Load images
            const savedImages = localStorage.getItem(`poi-images-${poiId}`);
            if (savedImages) {
                try {
                    setUserImages(JSON.parse(savedImages));
                } catch (e) {
                    console.error('Failed to parse saved images', e);
                }
            } else {
                setUserImages([]);
            }
        }
    }, [mounted, poiId]);

    if (!isOpen || !poi || !mounted) return null;

    // Extract properties safely (handles both GeoJSON Features and legacy objects)
    const props = poi.properties || poi;
    const name = props.translatedName || props.name || 'Location Details';
    const category = props.displayCategory || props.category || 'Point of Interest';
    const rating = props.rating;
    const userRatingsTotal = props.userRatingsTotal || 0;
    const imageUrl = props.imageUrl || poi.imageUrl;
    const initialReviews: Review[] = props.reviews || poi.reviews || [];
    const phone = props.phone || poi.phone;
    const website = props.website || poi.website;
    const openingHours = props.openingHours || poi.openingHours;
    const icon = props.icon || poi.icon;
    const isStub = props.isStub;

    // Extract coordinates safely
    const coords = poi.geometry?.coordinates 
        ? { lat: poi.geometry.coordinates[1], lng: poi.geometry.coordinates[0] }
        : poi.coordinates;

    const hasInitialReviews = initialReviews && initialReviews.length > 0;
    const hasUserReviews = userReviews && userReviews.length > 0;
    const CategoryIcon = icon || MapPin;

    const modalContent = (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl rounded-2xl border border-slate-200 dark:border-slate-800 z-[11001] overflow-hidden flex flex-col max-h-[85vh]">
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
                            <h2 className="text-2xl font-bold leading-tight mb-0.5">{name}</h2>
                            {typeof rating === 'number' && (
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center text-blue-500">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <Star key={i} size={14} className={i < Math.round(rating) ? 'fill-current' : 'text-blue-200 dark:text-blue-900/40'} />
                                        ))}
                                    </div>
                                    <span className="font-bold text-sm">{typeof rating === 'string' ? rating : rating.toFixed(1)}</span>
                                    {userRatingsTotal > 0 && (
                                        <span className="text-white/70 text-xs">({userRatingsTotal} reviews)</span>
                                    )}
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
                        <a 
                            href={coords ? `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="flex-1 flex items-center justify-center gap-2 p-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-colors text-sm font-semibold"
                        >
                            <MapPin size={16} /> Directions
                        </a>
                    </div>

                    {/* Opening Hours */}
                    {openingHours && (
                        <div className="mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
                                    <Clock size={16} className="text-blue-500" />
                                    Opening Hours
                                </div>
                                {openingHours.open_now !== undefined && (
                                    <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full ${openingHours.open_now ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                        {openingHours.open_now ? 'Open Now' : 'Closed'}
                                    </span>
                                )}
                            </div>
                            <div className="space-y-1">
                                {groupOpeningHours(openingHours.weekday_text).map((group, idx: number) => {
                                    return (
                                        <p key={idx} className={`text-xs ${group.includesToday ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
                                            {group.text}
                                        </p>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Reviews Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <Quote size={18} className="text-slate-400" />
                                Reviews
                            </h3>
                            {!isAddingReview && (
                                <button 
                                    onClick={() => setIsAddingReview(true)}
                                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                >
                                    Write a review
                                </button>
                            )}
                        </div>

                        {isAddingReview && (
                            <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 mb-4"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Your Rating</span>
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <button 
                                                key={star}
                                                onClick={() => setNewRating(star)}
                                                className="focus:outline-none"
                                            >
                                                <Star 
                                                    size={18} 
                                                    className={star <= newRating ? 'fill-blue-500 text-blue-500' : 'text-blue-200 dark:text-blue-900/40'} 
                                                />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <textarea 
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Share your experience..."
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm min-h-[100px] focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all dark:text-white mb-3"
                                />
                                <div className="flex flex-wrap gap-2 mb-4">
                                    <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-all group">
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                            <Plus size={20} className="text-slate-400 group-hover:text-blue-500" />
                                            <span className="text-[10px] text-slate-400 group-hover:text-blue-500 mt-1 font-medium">Add Photo</span>
                                        </div>
                                        <input 
                                            type="file" 
                                            className="hidden" 
                                            accept="image/*"
                                            multiple
                                            onChange={(e) => {
                                                const files = Array.from(e.target.files || []);
                                                files.forEach(file => {
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        const base64String = reader.result as string;
                                                        const updatedImages = [base64String, ...userImages];
                                                        setUserImages(updatedImages);
                                                        if (poiId) {
                                                            localStorage.setItem(`poi-images-${poiId}`, JSON.stringify(updatedImages));
                                                        }
                                                    };
                                                    reader.readAsDataURL(file);
                                                });
                                            }}
                                        />
                                    </label>
                                    {userImages.slice(0, 5).map((img, i) => (
                                        <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden group">
                                            <img src={img} alt="" className="w-full h-full object-cover" />
                                            <button 
                                                onClick={() => {
                                                    const updated = userImages.filter((_, idx) => idx !== i);
                                                    setUserImages(updated);
                                                    if (poiId) {
                                                        localStorage.setItem(`poi-images-${poiId}`, JSON.stringify(updated));
                                                    }
                                                }}
                                                className="absolute top-1 right-1 bg-black/50 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                    {userImages.length > 5 && (
                                        <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-xs font-bold text-slate-500">
                                            +{userImages.length - 5}
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-end gap-2">
                                    <button 
                                        onClick={() => {
                                            setIsAddingReview(false);
                                            setNewComment('');
                                        }}
                                        className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={() => {
                                            if (!newComment.trim()) return;
                                            const review: Review = {
                                                author_name: 'You',
                                                rating: newRating,
                                                relative_time_description: 'Just now',
                                                text: newComment,
                                                time: Math.floor(Date.now() / 1000),
                                            };
                                            const updatedReviews = [review, ...userReviews];
                                            setUserReviews(updatedReviews);
                                            
                                            // Persist to localStorage
                                            const poiId = props.id || poi.id;
                                            if (poiId) {
                                                localStorage.setItem(`poi-reviews-${poiId}`, JSON.stringify(updatedReviews));
                                            }

                                            setIsAddingReview(false);
                                            setNewComment('');
                                            setNewRating(5);
                                        }}
                                        disabled={!newComment.trim()}
                                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-colors"
                                    >
                                        Post Review
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* Community Photos Section */}
                        {userImages.length > 0 && (
                            <div className="space-y-4 mb-8">
                                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <Camera size={18} className="text-blue-500" />
                                    Community Photos
                                </h3>
                                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                                    {userImages.map((img, i) => (
                                        <div key={i} className="relative flex-shrink-0 w-32 h-32 sm:w-40 sm:h-40 rounded-2xl overflow-hidden shadow-md">
                                            <img src={img} alt="" className="w-full h-full object-cover" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Cheapest Go Reviews */}
                        {hasUserReviews && (
                            <div className="space-y-4 mb-6">
                                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <Star size={18} className="text-blue-500 fill-blue-500" />
                                    Cheapest Go Reviews
                                </h3>
                                <div className="grid gap-4">
                                    {userReviews.map((r: Review, idx: number) => (
                                        <ReviewCard key={`user-${idx}`} review={r} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Google/External Reviews */}
                        {hasInitialReviews ? (
                            <div className="space-y-4">
                                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <Quote size={18} className="text-slate-400" />
                                    {props.source === 'fsq-google' ? 'Google & Foursquare Reviews' :
                                    props.source === 'foursquare' ? 'Foursquare Recommendations' : 
                                    'Google Reviews'}
                                </h3>
                                <div className="grid gap-4">
                                    {initialReviews.map((r: Review, idx: number) => (
                                        <ReviewCard key={`initial-${idx}`} review={r} />
                                    ))}
                                </div>
                            </div>
                        ) : isStub ? (
                            <div className="flex flex-col items-center justify-center py-8 gap-3">
                                <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                <p className="text-xs font-medium text-slate-500">Loading reviews...</p>
                            </div>
                        ) : !hasUserReviews ? (
                            <div className="text-center py-8">
                                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Star className="text-slate-400" size={20} />
                                </div>
                                <p className="text-sm text-slate-500 dark:text-slate-400">No direct reviews available for this place yet.</p>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
