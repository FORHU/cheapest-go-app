import React, { useState, useEffect, useRef } from 'react';
import { calculateHaversineDistance } from '@/utils/geo';
import { getMapboxPoiImage } from '@/utils/images';
import { mapPoiDetails } from '@/utils/poi-mapper';
import { env } from '@/utils/env';
import { BAGUIO_DEFAULT_GEMS, POI_ICON_MAP } from '@/config/map-discovery';
import { Landmark, Trees, Utensils, Pill, ShoppingBasket, Bus } from 'lucide-react';

interface UseNearbyGemsProps {
    isLoaded: boolean;
    coordinates?: { lat: number; lng: number };
    selectedCategory: string;
    onClearDirections?: () => void;
}

// Concurrency limiter logic
const pLimit = (limit: number) => {
    let active = 0;
    const queue: (() => void)[] = [];
    const next = () => { if (queue.length > 0 && active < limit) { active++; queue.shift()!(); } };
    return <T,>(fn: () => Promise<T>): Promise<T> =>
        new Promise<T>((resolve, reject) => {
            const run = () => fn().then(resolve, reject).finally(() => { active--; next(); });
            queue.push(run);
            next();
        });
};

export const useNearbyGems = ({
    isLoaded,
    coordinates,
    selectedCategory,
    onClearDirections
}: UseNearbyGemsProps) => {
    const [nearbyGems, setNearbyGems] = useState<any[]>([]);
    const [isFetchingGems, setIsFetchingGems] = useState(false);
    const hasCoordinates = coordinates && coordinates.lat !== 0 && coordinates.lng !== 0;

    const buildPoiProxyImageUrl = (name: string, lat: number, lng: number, placeId?: string, fsqId?: string, category?: string) => {
        const params = new URLSearchParams({
            name,
            lat: String(lat),
            lng: String(lng),
        });
        if (placeId) params.set('placeId', placeId);
        if (fsqId) params.set('fsqId', fsqId);
        if (category) params.set('category', category);
        return `/api/poi-photo?${params.toString()}`;
    };

    useEffect(() => {
        if (!isLoaded || !hasCoordinates || !env.MAPBOX_TOKEN) {
            console.log(`[Gems] Hook skipped: isLoaded=${isLoaded}, hasCoordinates=${!!hasCoordinates}, hasToken=${!!env.MAPBOX_TOKEN}`);
            return;
        }
        
        const controller = new AbortController();
        const { signal } = controller;

        const fetchTopGems = async () => {
            setIsFetchingGems(true);
            setNearbyGems([]); // Clear immediately so UI shows loading state
            
            try {

                // Global Discovery Fallback (Google -> Mapbox)
                const getSearchCategories = (id: string) => {
                    switch (id) {
                        case 'all': return ['tourism', 'park', 'restaurant', 'museum'];
                        case 'restaurant': return ['restaurant', 'cafe', 'bar', 'food'];
                        case 'attraction': return ['park', 'tourism', 'museum', 'monument', 'viewpoint', 'attraction'];
                        case 'grocery': return ['grocery_store', 'supermarket', 'convenience_store', 'market'];
                        case 'medical': return ['hospital', 'pharmacy', 'medical_clinic', 'doctor'];
                        case 'transit': return ['bus_station', 'train_station', 'subway_station', 'airport'];
                        default: return [id];
                    }
                };

                // Global Discovery Fallback (Google -> Foursquare -> Mapbox)
                let featuresToProcess: any[] = [];
                try {
                    // Try Google Places first
                    let primaryFeatures: any[] = [];
                    try {
                        const googleRes = await fetch(`/api/places/discover?lat=${coordinates.lat}&lng=${coordinates.lng}&category=${selectedCategory}&radius=3000`, { signal });
                        if (googleRes.ok) {
                            const data = await googleRes.json();
                            primaryFeatures = data.features || [];
                        }
                    } catch (e: any) {
                        if (e.name !== 'AbortError') console.warn('Google discovery failed:', e);
                    }

                    if (primaryFeatures.length > 0) {
                        featuresToProcess = primaryFeatures;
                    } else {
                        // Fallback to Foursquare if Google fails or returns no results
                        try {
                            const fsqRes = await fetch(`/api/foursquare/recommendations?lat=${coordinates.lat}&lng=${coordinates.lng}&category=${selectedCategory}&radius=3000`, { signal });
                            if (fsqRes.ok) {
                                const data = await fsqRes.json();
                                featuresToProcess = data.features || [];
                            }
                        } catch (e: any) {
                            if (e.name !== 'AbortError') console.warn('Foursquare discovery failed:', e);
                        }
                    }

                    if (featuresToProcess.length > 0) {
                        // Deduplicate by name (robust fallback)
                        const seen = new Set();
                        featuresToProcess = featuresToProcess.filter(f => {
                            const nameKey = (f.properties?.name || '').toLowerCase().trim();
                            if (!nameKey || seen.has(nameKey)) return false;
                            seen.add(nameKey);
                            return true;
                        });
                    }
                } catch (e) {
                    console.warn('External discovery aggregate failed:', e);
                }

                if (featuresToProcess.length < 5) {
                    const categories = getSearchCategories(selectedCategory);
                    if (onClearDirections) onClearDirections();

                    const fetchPromises = categories.map(cat =>
                        fetch(`https://api.mapbox.com/search/searchbox/v1/category/${encodeURIComponent(cat)}?access_token=${env.MAPBOX_TOKEN}&language=en&limit=25&proximity=${coordinates.lng},${coordinates.lat}`, { signal })
                            .then(res => res.json())
                            .catch(() => ({ features: [] }))
                    );
                    const categoryResponses = await Promise.all(fetchPromises);
                    if (signal.aborted) return;

                    const uniqueFeatures: Record<string, any> = {};
                    featuresToProcess.forEach(f => { if (f.properties?.name) uniqueFeatures[f.properties.name] = f; });
                    categoryResponses.forEach(data => {
                        if (data.features) {
                            data.features.forEach((f: any) => {
                                const name = f.properties.name || f.properties.place_name || f.properties.name_en;
                                if (name && !uniqueFeatures[name]) uniqueFeatures[name] = f;
                            });
                        }
                    });
                    featuresToProcess = Object.values(uniqueFeatures);
                } else if (onClearDirections) {
                    onClearDirections();
                }

                featuresToProcess = featuresToProcess.slice(0, 20);
                if (featuresToProcess.length === 0) {
                    setIsFetchingGems(false);
                    return;
                }

                const initialGems = featuresToProcess.map((f: any) => {
                    const name = f.properties.name || f.properties.place_name || f.properties.name_en;
                    const lng = f.geometry.coordinates[0];
                    const lat = f.geometry.coordinates[1];
                    const placeId = f.properties?.place_id || '';
                    const fsqId = f.properties?.fsq_id || '';
                    const source = f.properties?.source;
                    const isGoogleSource = source === 'google';
                    const isFsqSource = source === 'foursquare';

                    // Determine icon based on category or maki
                    const cat = (f.properties.category || '').toLowerCase();
                    const maki = (f.properties.maki || '').toLowerCase();
                    const icon = (maki.includes('restaurant') || maki.includes('cafe') || maki.includes('bar') || cat.includes('restaurant') || cat.includes('cafe') || cat.includes('food')) ? Utensils :
                                 (maki.includes('park') || maki.includes('garden') || cat.includes('park')) ? Trees :
                                 (maki.includes('museum') || cat.includes('tourism') || cat.includes('landmark') || cat.includes('attraction')) ? Landmark : Landmark;

                    return {
                        ...f,
                        id: name, // Unique ID for feature-state
                        properties: {
                            ...f.properties,
                            name,
                            category: f.properties.category || 'Point of Interest',
                            icon,
                            // Always route through our proxy so content-type validation + fallback logic is applied.
                            imageUrl: buildPoiProxyImageUrl(name, lat, lng, placeId, fsqId, cat),
                            rating: f.properties.rating,
                            userRatingsTotal: f.properties.userRatingsTotal || 0,
                            reviews: f.properties.reviews || [],
                            sourceLabel: source === 'fsq-google' ? 'Google & Foursquare Reviews' :
                                         source === 'foursquare' ? 'Foursquare Recommendations' : 
                                         'Google Reviews',
                            isStub: !isFsqSource, // Foursquare Discovery provides tips/details, but Google Discovery only provides basic info
                            source: source || 'mapbox'
                        }
                    };
                });
                setNearbyGems(initialGems);

                // --- STAGE 2: ENRICHMENT ---
                const limiter = pLimit(12); 
                let resolvedCount = 0;
                let gemBuffer = [...initialGems];
                let lastUpdate = Date.now();

                const retrievePromises = initialGems.map((featureStub, idx) =>
                    limiter(async () => {
                        if (signal.aborted) return;
                        const name = featureStub.properties.name;
                        const lng = featureStub.geometry.coordinates[0];
                        const lat = featureStub.geometry.coordinates[1];
                        const placeId = featureStub.properties.place_id || '';
                        const fsqId = featureStub.properties.fsq_id || '';

                        // Fast-path: If it's already a rich feature from advanced discovery, skip background enrichment
                        if (!featureStub.properties.isStub) {
                            resolvedCount++;
                            if (resolvedCount === initialGems.length && !signal.aborted) {
                                setNearbyGems([...gemBuffer]);
                                const enrichedCount = gemBuffer.filter(p => !p.properties.isStub).length;
                                const isBaguio = Math.abs(coordinates.lat - 16.41) < 0.2 && Math.abs(coordinates.lng - 120.6) < 0.2;
                                if (enrichedCount < 5 && isBaguio) {
                                    const newGems = [...gemBuffer];
                                    BAGUIO_DEFAULT_GEMS.forEach(gemFeature => {
                                        const gemName = gemFeature.properties.name;
                                        const gCat = gemFeature.properties.category.toLowerCase();
                                        const sCat = selectedCategory === 'restaurant' ? 'dining' : selectedCategory;
                                        const matchesCat = selectedCategory === 'all' || gCat.includes(sCat) || (selectedCategory === 'attraction' && (gCat.includes('sightseeing') || gCat.includes('landmark') || gCat.includes('park')));

                                        if (matchesCat && !newGems.find(r => r.properties.name === gemName)) {
                                            newGems.push({ 
                                                ...gemFeature, 
                                                properties: { ...gemFeature.properties, imageUrl: getMapboxPoiImage(gemName, gemFeature.geometry.coordinates[1], gemFeature.geometry.coordinates[0], gCat) }
                                            });
                                        }
                                    });
                                    setNearbyGems(newGems);
                                }
                            }
                            return;
                        }

                        try {
                            const lowerCat = (featureStub.properties.category || '').toLowerCase();
                            const enrichmentIcon = 
                                (lowerCat.includes('hospital') || lowerCat.includes('pharmacy') || lowerCat.includes('medical')) ? Pill :
                                (lowerCat.includes('supermarket') || lowerCat.includes('grocery') || lowerCat.includes('shop')) ? ShoppingBasket :
                                (lowerCat.includes('bus') || lowerCat.includes('station') || lowerCat.includes('transit')) ? Bus :
                                (lowerCat.includes('restaurant') || lowerCat.includes('cafe') || lowerCat.includes('food')) ? Utensils :
                                (lowerCat.includes('park') || lowerCat.includes('garden')) ? Trees : Landmark;

                            const proxyRes = await fetch(`/api/poi-photo?name=${encodeURIComponent(name)}&lat=${lat}&lng=${lng}&placeId=${placeId}&fsqId=${fsqId}${lowerCat ? `&category=${encodeURIComponent(lowerCat)}` : ''}&full=true`, { signal });
                            const proxyData = await proxyRes.json();

                            const enriched = {
                                ...featureStub,
                                id: name,
                                properties: {
                                    ...featureStub.properties,
                                    translatedName: proxyData.nameEn || proxyData.name || featureStub.properties.name,
                                    icon: enrichmentIcon,
                                    imageUrl: buildPoiProxyImageUrl(name, lat, lng, placeId, fsqId, lowerCat),
                                    displayCategory: proxyData.category || featureStub.properties.category, // Use proxy's category for display if available
                                    vicinity: proxyData.vicinity || featureStub.properties.vicinity,
                                    rating: proxyData.rating,
                                    userRatingsTotal: proxyData.userRatingsTotal,
                                    reviews: [
                                        ...(featureStub.properties.reviews || []),
                                        ...(proxyData.reviews || []).filter((r: any) => 
                                            !(featureStub.properties.reviews || []).some((fr: any) => fr.text === r.text)
                                        )
                                    ].slice(0, 10),
                                    phone: proxyData.phone || null,
                                    website: proxyData.website || null,
                                    openingHours: proxyData.openingHours || null,
                                    source: proxyData.source || featureStub.properties.source || 'mapbox',
                                    sourceLabel: (proxyData.source === 'fsq-google') ? 'Google & Foursquare Reviews' :
                                                 (proxyData.source === 'foursquare') ? 'Foursquare Recommendations' : 
                                                 'Google Reviews',
                                    isStub: false
                                }
                            };

                            if (!signal.aborted) {
                                const hasRealImage = proxyData.source !== 'placeholder' && proxyData.source !== 'none' && proxyData.source !== 'error-fallback' && proxyData.source !== 'mock-fallback';
                                const hasReviews = (enriched.properties.userRatingsTotal || 0) > 0 || (enriched.properties.reviews && enriched.properties.reviews.length > 0);
                                const hasLowRating = enriched.properties.rating !== undefined && enriched.properties.rating !== null && enriched.properties.rating < 3.5;

                                if (hasRealImage && hasReviews && !hasLowRating) {
                                    gemBuffer = gemBuffer.map(g => g.properties.name === name ? enriched : g);
                                } else {
                                    gemBuffer = gemBuffer.filter(g => g.properties.name !== name);
                                }
                                if (Date.now() - lastUpdate > 800 || resolvedCount === initialGems.length - 1) {
                                    setNearbyGems([...gemBuffer]);
                                    lastUpdate = Date.now();
                                }
                            }
                        } catch (e: any) {
                            if (e.name !== 'AbortError') console.error(`Gem enrichment failed for ${name}:`, e);
                        } finally {
                            resolvedCount++;
                            if (resolvedCount === initialGems.length && !signal.aborted) {
                                setNearbyGems([...gemBuffer]);
                                
                                // Final Baguio Fallback
                                const enrichedCount = gemBuffer.filter(p => !p.properties.isStub).length;
                                const isBaguio = Math.abs(coordinates.lat - 16.41) < 0.2 && Math.abs(coordinates.lng - 120.6) < 0.2;
                                if (enrichedCount < 5 && isBaguio) {
                                    const newGems = [...gemBuffer];
                                    BAGUIO_DEFAULT_GEMS.forEach(gemFeature => {
                                        const gemName = gemFeature.properties.name;
                                        const gCat = gemFeature.properties.category.toLowerCase();
                                        const sCat = selectedCategory === 'restaurant' ? 'dining' : selectedCategory;
                                        const matchesCat = selectedCategory === 'all' || gCat.includes(sCat) || (selectedCategory === 'attraction' && (gCat.includes('sightseeing') || gCat.includes('landmark') || gCat.includes('park')));

                                        if (matchesCat && !newGems.find(r => r.properties.name === gemName)) {
                                            newGems.push({ 
                                                ...gemFeature, 
                                                properties: { ...gemFeature.properties, imageUrl: getMapboxPoiImage(gemName, gemFeature.geometry.coordinates[1], gemFeature.geometry.coordinates[0], gCat) }
                                            });
                                        }
                                    });
                                    setNearbyGems(newGems);
                                }
                            }
                        }
                    })
                );

                await Promise.all(retrievePromises);
            } catch (err: any) {
                if (err?.name === 'AbortError') return; // normal React cleanup — not an error
                console.error('Fetching gems failed:', err);
                const isBaguio = Math.abs(coordinates.lat - 16.41) < 0.2 && Math.abs(coordinates.lng - 120.6) < 0.2;
                if (isBaguio && selectedCategory === 'all') setNearbyGems(BAGUIO_DEFAULT_GEMS);
            } finally {
                if (!signal.aborted) setIsFetchingGems(false);
            }
        };

        fetchTopGems();
        return () => controller.abort();
    }, [isLoaded, hasCoordinates, coordinates?.lat, coordinates?.lng, selectedCategory]);

    return { nearbyGems, isFetchingGems, setNearbyGems };
};
