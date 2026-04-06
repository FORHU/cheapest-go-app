import React from 'react';
import { MapPopup } from '@/components/map/MapPopup';
import { MapMarker } from '@/components/map/MapMarker';
import { MappableProperty } from '../utils/buildGeoJson';
import { useUserCurrency } from '@/stores/searchStore';
import { convertCurrency } from '@/lib/currency';

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
    const targetCurrency = useUserCurrency();

    if (!selectedProperty) return null;

    return (
        <>
            <MapMarker
                property={selectedProperty}
                displayPrice={convertCurrency(selectedProperty.price, selectedProperty.currency || 'USD', targetCurrency)}
                displayCurrency={targetCurrency}
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
