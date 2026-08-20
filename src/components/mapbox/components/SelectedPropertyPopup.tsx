import React from 'react';
import { MapPopup } from '@/components/map/MapPopup';
import { MapMarker } from '@/components/map/MapMarker';
import { MappableProperty } from '../utils/buildGeoJson';
import { useUserCurrency } from '@/stores/searchStore';
import { useNights } from '@/hooks/useNights';
import { toPerNight } from '@/lib/perNightPrice';

interface SelectedPropertyPopupProps {
    selectedProperty: MappableProperty | null;
    onClose: () => void;
    onViewDetails: (id: string) => void;
    onSelect: (id: string) => void;
    isMobile?: boolean;
}

export const SelectedPropertyPopup = React.memo(({
    selectedProperty,
    onClose,
    onViewDetails,
    onSelect,
    isMobile = false,
}: SelectedPropertyPopupProps) => {
    const targetCurrency = useUserCurrency();
    const nights = useNights();

    if (!selectedProperty) return null;

    return (
        <>
            <MapMarker
                property={selectedProperty}
                displayPrice={toPerNight(selectedProperty.price, selectedProperty.currency, targetCurrency, nights)}
                displayCurrency={targetCurrency}
                isSelected={true}
                isHovered={false}
                onClick={() => onSelect(selectedProperty.id)}
                onHover={() => { }}
            />
            {!isMobile && (
                <MapPopup
                    property={selectedProperty}
                    onClose={onClose}
                    onViewDetails={onViewDetails}
                />
            )}
        </>
    );
});
