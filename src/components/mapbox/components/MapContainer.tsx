import { Map, type StandardStyleConfig } from '@/components/ui/map';
import { NavigationControl, MapRef } from 'react-map-gl/mapbox';
import { Layers } from 'lucide-react';
import { MapDetailsPanel } from './MapDetailsPanel';
import { useMapDetails } from '../hooks/useMapDetails';

interface MapContainerProps {
    mapRef: React.RefObject<MapRef | null>;
    initialViewState: {
        longitude: number;
        latitude: number;
        zoom: number;
        pitch?: number;
        bearing?: number;
    };
    onLoad: (e: any) => void;
    onClick: (e: any) => void;
    onMouseMove: (e: any) => void;
    onMoveEnd?: (e: any) => void;
    children?: React.ReactNode;
    /**
     * When true the Layers button and MapDetailsPanel are NOT rendered.
     * Pass this when the parent already owns the panel (e.g. SearchMapContainer).
     */
    hideLayersButton?: boolean;
    mapStyle?: string;
    standardConfig?: StandardStyleConfig;
    enable3DTerrain?: boolean;
    onStyleReady?: (map: mapboxgl.Map) => void;
}

export const MapContainer = ({
    mapRef,
    initialViewState,
    onLoad,
    onClick,
    onMouseMove,
    onMoveEnd,
    children,
    hideLayersButton = false,
    mapStyle: propMapStyle,
    standardConfig: propStandardConfig,
    enable3DTerrain: propEnable3DTerrain,
    onStyleReady,
}: MapContainerProps) => {
    // Internal details state — only active when this component owns the Layers UI.
    // When `hideLayersButton` is true the parent handles everything; we still call
    // the hook (hooks can't be conditional) but skip rendering the panel entirely.
    const {
        mapType,
        setMapType,
        showDetailsPanel,
        setShowDetailsPanel,
        showLabels,
        setShowLabels,
        mapDetails,
        handleDetailToggle,
        terrainEnabled: internalTerrainEnabled,
        mapStyleUrl: internalMapStyleUrl,
        standardConfig: internalStandardConfig,
    } = useMapDetails();

    const finalMapStyle      = propMapStyle       ?? internalMapStyleUrl;
    const finalStandardConfig = propStandardConfig ?? (mapType === 'default-3d' ? internalStandardConfig : undefined);
    const finalTerrainEnabled = propEnable3DTerrain ?? internalTerrainEnabled;

    return (
        <Map
            ref={mapRef}
            mapStyle={finalMapStyle}
            standardConfig={finalStandardConfig}
            enable3DTerrain={finalTerrainEnabled}
            terrainExaggeration={1.5}
            initialViewState={{
                pitch: 45,
                bearing: -10,
                ...initialViewState,
            }}
            maxPitch={60}
            onClick={onClick}
            onMouseMove={onMouseMove}
            onMoveEnd={onMoveEnd}
            onLoad={onLoad}
            onStyleReady={onStyleReady}
            enable3DBuildings={false}
            attributionControl={false}
            className="rounded-none min-h-0 w-full h-full"
        >
            <NavigationControl position="bottom-right" showCompass visualizePitch />
            {children}

            {/* ── Layers button & panel — only rendered when this component owns them ── */}
            {!hideLayersButton && (
                <>
                    {!showDetailsPanel && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowDetailsPanel(true);
                            }}
                            className="absolute top-4 left-4 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 px-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 group h-[38px]"
                        >
                            <Layers className="w-5 h-5 text-slate-700 dark:text-slate-300 group-hover:text-blue-500 transition-colors" />
                            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
                            <svg className="w-3 h-3 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    )}

                    <MapDetailsPanel
                        isOpen={showDetailsPanel}
                        onClose={() => setShowDetailsPanel(false)}
                        mapType={mapType}
                        onMapTypeChange={setMapType}
                        details={mapDetails}
                        onDetailToggle={handleDetailToggle}
                        showLabels={showLabels}
                        onLabelsToggle={() => setShowLabels((prev) => !prev)}
                    />
                </>
            )}
        </Map>
    );
};
