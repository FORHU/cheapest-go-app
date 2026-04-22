'use client';

import React from 'react';
import { X } from 'lucide-react';

export type MapTypeId = 'default-3d' | 'default' | 'satellite';

export interface MapDetailToggle {
    id: string;
    label: string;
    enabled: boolean;
}

interface MapTypeTile {
    id: MapTypeId;
    label: string;
    thumbnail: string;
}

function DiscoveryIcon({ size = 'w-8 h-8' }: { size?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={size} fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M12 5l-1 1M12 5l1 1" />
            <path d="M12 19l-1-1M12 19l1-1M5 12l1 1M5 12l1-1M19 12l-1 1M19 12l-1-1" />
        </svg>
    );
}

const MAP_TYPE_TILES: MapTypeTile[] = [
    {
        id: 'default-3d',
        label: 'Default 3D',
        thumbnail: 'linear-gradient(135deg, #d4e4c8 0%, #c8d8bc 30%, #e8dcc8 60%, #ddd5c8 100%)',
    },
    {
        id: 'default',
        label: 'Default',
        thumbnail: 'linear-gradient(135deg, #f0f0e8 0%, #e0e0d0 30%, #f5f5ed 60%, #fafafa 100%)',
    },
    {
        id: 'satellite',
        label: 'Satellite',
        thumbnail: 'linear-gradient(135deg, #2a4a2a 0%, #1a3a2a 30%, #1a2e1a 60%, #0f1f0f 100%)',
    },
];

function TransitIcon({ size = 'w-8 h-8' }: { size?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={size} fill="none" stroke="currentColor" strokeWidth={1.5}>
            <rect x="6" y="3" width="12" height="15" rx="2" />
            <circle cx="9" cy="14" r="1" fill="currentColor" />
            <circle cx="15" cy="14" r="1" fill="currentColor" />
            <path d="M9 18l-1 3M15 18l1 3M6 10h12" />
        </svg>
    );
}

function TrafficIcon({ size = 'w-8 h-8' }: { size?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={size} fill="none" stroke="currentColor" strokeWidth={1.5}>
            <rect x="7" y="2" width="10" height="20" rx="3" />
            <circle cx="12" cy="7" r="1.5" fill="currentColor" className="text-red-400" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" className="text-yellow-400" />
            <circle cx="12" cy="17" r="1.5" fill="currentColor" className="text-green-400" />
        </svg>
    );
}

function BikingIcon({ size = 'w-8 h-8' }: { size?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={size} fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="6" cy="17" r="3" />
            <circle cx="18" cy="17" r="3" />
            <path d="M6 17l4-8 4 8M10 9h4l4 8" />
            <circle cx="12" cy="5" r="1.5" fill="currentColor" />
        </svg>
    );
}

function TerrainIcon({ size = 'w-8 h-8' }: { size?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={size} fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M2 20l7-12 5 8 3-4 5 8H2z" fill="currentColor" fillOpacity={0.15} />
            <path d="M18 10l-2.5 2.5L13 10l-2.5 2.5L8 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 20l7-12 5 8 3-4 5 8" />
        </svg>
    );
}

const getDetailIcons = (sizeClass: string): Record<string, React.ReactNode> => ({
    discovery: <DiscoveryIcon size={sizeClass} />,
    transit: <TransitIcon size={sizeClass} />,
    traffic: <TrafficIcon size={sizeClass} />,
    biking: <BikingIcon size={sizeClass} />,
    terrain: <TerrainIcon size={sizeClass} />,
});

interface MapDetailsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    mapType: MapTypeId;
    onMapTypeChange: (type: MapTypeId) => void;
    details: MapDetailToggle[];
    onDetailToggle: (id: string) => void;
    showLabels: boolean;
    onLabelsToggle: () => void;
    isFullscreen?: boolean;
}

export function MapDetailsPanel({
    isOpen,
    onClose,
    mapType,
    onMapTypeChange,
    details,
    onDetailToggle,
    showLabels,
    onLabelsToggle,
    isFullscreen = true,
}: MapDetailsPanelProps) {
    if (!isOpen) return null;

    return (
        <div className={`absolute top-2 left-2 z-[60] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-all duration-300
            ${isFullscreen ? 'w-[300px]' : 'w-[170px] sm:w-[220px]'}
        `}>
            {/* Header */}
            <div className={`flex items-center justify-between ${isFullscreen ? 'px-4 pt-4 pb-2' : 'px-2.5 pt-2.5 pb-1'}`}>
                <h3 className={`${isFullscreen ? 'text-base font-semibold' : 'text-[10px] font-bold'} text-slate-900 dark:text-slate-100 uppercase tracking-wide`}>Map details</h3>
                <button
                    onClick={onClose}
                    className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                    <X className={`${isFullscreen ? 'w-5 h-5' : 'w-4 h-4'} text-slate-500`} />
                </button>
            </div>

            {/* Map details toggles */}
            <div className={`${isFullscreen ? 'px-4 pb-3' : 'px-2 pb-1.5'}`}>
                <div className={`grid grid-cols-3 ${isFullscreen ? 'gap-2' : 'gap-1'}`}>
                    {details.map((detail) => {
                        const isDisabled = detail.id === 'terrain' && mapType !== 'default-3d';
                        const icons = getDetailIcons(isFullscreen ? 'w-8 h-8' : 'w-5 h-5');
                        return (
                        <button
                            key={detail.id}
                            onClick={() => onDetailToggle(detail.id)}
                            disabled={isDisabled}
                            className={`
                                flex flex-col items-center gap-1 rounded-xl border-2 transition-all cursor-pointer
                                ${isFullscreen ? 'p-2' : 'p-1'}
                                ${
                                    isDisabled
                                        ? 'opacity-50 cursor-not-allowed border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50'
                                        : detail.enabled
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }
                            `}
                        >
                            <div
                                className={`${
                                    detail.enabled && !isDisabled ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'
                                }`}
                            >
                                {icons[detail.id]}
                            </div>
                            <span
                                className={`${isFullscreen ? 'text-xs font-medium' : 'text-[8px] leading-tight font-semibold'} ${
                                    detail.enabled && !isDisabled ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-400'
                                }`}
                            >
                                {detail.label}
                            </span>
                        </button>
                        );
                    })}
                </div>
            </div>

            {/* Map type */}
            <div className={`${isFullscreen ? 'px-4 pb-3' : 'px-2 pb-1.5'}`}>
                <p className={`${isFullscreen ? 'text-xs mb-2' : 'text-[9px] mb-1'} font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-0.5`}>
                    Map type
                </p>
                <div className={`grid grid-cols-3 ${isFullscreen ? 'gap-2' : 'gap-1'}`}>
                    {MAP_TYPE_TILES.map((tile) => (
                        <button
                            key={tile.id}
                            onClick={() => onMapTypeChange(tile.id)}
                            className={`
                                flex flex-col items-center gap-1 rounded-xl border-2 overflow-hidden transition-all cursor-pointer
                                ${
                                    mapType === tile.id
                                        ? 'border-blue-500'
                                        : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                                }
                            `}
                        >
                            <div
                                className={`w-full bg-cover bg-center ${isFullscreen ? 'h-14' : 'h-6'}`}
                                style={{ background: tile.thumbnail }}
                            />
                            <span
                                className={`${isFullscreen ? 'text-xs pb-1.5' : 'text-[8px] pb-0.5'} font-medium ${
                                    mapType === tile.id ? 'text-blue-700 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'
                                }`}
                            >
                                {tile.label}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Labels toggle */}
            <div className={`${isFullscreen ? 'px-5 pb-5 pt-1' : 'px-3 pb-2 pt-1'} flex items-center justify-between border-t border-slate-100 dark:border-slate-800 mt-1`}>
                <span className={`${isFullscreen ? 'text-sm' : 'text-xs'} font-medium text-slate-700 dark:text-slate-300`}>Labels</span>
                <button
                    onClick={onLabelsToggle}
                    className={`
                        relative rounded-full transition-colors cursor-pointer
                        ${isFullscreen ? 'w-11 h-6' : 'w-8 h-4.5'}
                        ${showLabels ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}
                    `}
                >
                    <span
                        className={`
                            absolute top-0.5 left-0.5 bg-white rounded-full shadow-lg transition-transform
                            ${isFullscreen ? 'w-4 h-4 translate-y-0.5' : 'w-3.5 h-3.5'}
                            ${showLabels ? (isFullscreen ? 'translate-x-5' : 'translate-x-3.5') : 'translate-x-0'}
                        `}
                    />
                </button>
            </div>
        </div>
    );
}
