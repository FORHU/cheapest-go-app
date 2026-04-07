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

function TransitIcon() {
    return (
        <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <rect x="6" y="3" width="12" height="15" rx="2" />
            <circle cx="9" cy="14" r="1" fill="currentColor" />
            <circle cx="15" cy="14" r="1" fill="currentColor" />
            <path d="M9 18l-1 3M15 18l1 3M6 10h12" />
        </svg>
    );
}

function TrafficIcon() {
    return (
        <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <rect x="7" y="2" width="10" height="20" rx="3" />
            <circle cx="12" cy="7" r="1.5" fill="currentColor" className="text-red-400" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" className="text-yellow-400" />
            <circle cx="12" cy="17" r="1.5" fill="currentColor" className="text-green-400" />
        </svg>
    );
}

function BikingIcon() {
    return (
        <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <circle cx="6" cy="17" r="3" />
            <circle cx="18" cy="17" r="3" />
            <path d="M6 17l4-8 4 8M10 9h4l4 8" />
            <circle cx="12" cy="5" r="1.5" fill="currentColor" />
        </svg>
    );
}

function TerrainIcon() {
    return (
        <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M2 20l7-12 5 8 3-4 5 8H2z" fill="currentColor" fillOpacity={0.15} />
            <path d="M18 10l-2.5 2.5L13 10l-2.5 2.5L8 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 20l7-12 5 8 3-4 5 8" />
        </svg>
    );
}

const DETAIL_ICONS: Record<string, React.ReactNode> = {
    transit: <TransitIcon />,
    traffic: <TrafficIcon />,
    biking: <BikingIcon />,
    terrain: <TerrainIcon />,
};

interface MapDetailsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    mapType: MapTypeId;
    onMapTypeChange: (type: MapTypeId) => void;
    details: MapDetailToggle[];
    onDetailToggle: (id: string) => void;
    showLabels: boolean;
    onLabelsToggle: () => void;
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
}: MapDetailsPanelProps) {
    if (!isOpen) return null;

    return (
        <div className="absolute top-3 left-3 z-[60] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-[300px] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Map details</h3>
                <button
                    onClick={onClose}
                    className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                    <X className="w-5 h-5 text-slate-500" />
                </button>
            </div>

            {/* Map details toggles */}
            <div className="px-4 pb-3">
                <div className="grid grid-cols-3 gap-2">
                    {details.map((detail) => {
                        const isDisabled = detail.id === 'terrain' && mapType !== 'default-3d';
                        return (
                        <button
                            key={detail.id}
                            onClick={() => onDetailToggle(detail.id)}
                            disabled={isDisabled}
                            className={`
                                flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all cursor-pointer
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
                                {DETAIL_ICONS[detail.id]}
                            </div>
                            <span
                                className={`text-[11px] font-medium ${
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
            <div className="px-4 pb-3">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-0.5">
                    Map type
                </p>
                <div className="grid grid-cols-3 gap-2">
                    {MAP_TYPE_TILES.map((tile) => (
                        <button
                            key={tile.id}
                            onClick={() => onMapTypeChange(tile.id)}
                            className={`
                                flex flex-col items-center gap-1.5 rounded-xl border-2 overflow-hidden transition-all cursor-pointer
                                ${
                                    mapType === tile.id
                                        ? 'border-blue-500'
                                        : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                                }
                            `}
                        >
                            <div
                                className="w-full h-14 bg-cover bg-center"
                                style={{ background: tile.thumbnail }}
                            />
                            <span
                                className={`text-[11px] font-medium pb-1.5 ${
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
            <div className="px-5 pb-5 pt-1 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 mt-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Labels</span>
                <button
                    onClick={onLabelsToggle}
                    className={`
                        relative w-11 h-6 rounded-full transition-colors cursor-pointer
                        ${showLabels ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}
                    `}
                >
                    <span
                        className={`
                            absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-lg transition-transform
                            ${showLabels ? 'translate-x-5' : 'translate-x-0'}
                        `}
                    />
                </button>
            </div>
        </div>
    );
}
