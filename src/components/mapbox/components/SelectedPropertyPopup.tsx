import React from 'react';
import { MapPopup } from '@/components/map/MapPopup';
import { MapMarker } from '@/components/map/MapMarker';
import { MappableProperty } from '../utils/buildGeoJson';

interface SelectedPropertyPopupProps {
    selectedProperty: MappableProperty | null;
    onClose: () => void;
    onViewDetails: (id: string) => void;
    onSelect: (id: string) => void;
}

export const SelectedPropertyPopup = React.memo(({
    selectedProperty,
    onClose,
    onViewDetails,
    onSelect,
}: SelectedPropertyPopupProps) => {
    if (!selectedProperty) return null;

    return (
        <>
            <MapMarker
                property={selectedProperty}
                isSelected={true}
                isHovered={false}
                onClick={() => onSelect(selectedProperty.id)}
                onHover={() => { }}
            />
            <MapPopup
                property={selectedProperty}
                onClose={onClose}
                onViewDetails={onViewDetails}
            />
        </>
    );
});
