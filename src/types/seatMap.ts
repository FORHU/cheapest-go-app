// ─── Normalized seat map types ───────────────────────────────────────

export type SeatStatus = 'available' | 'occupied' | 'restricted';
export type SeatType = 'window' | 'aisle' | 'middle' | 'unknown';

export interface NormalizedSeat {
    designator: string;       // "1A", "12C"
    elementType: 'seat' | 'empty' | 'facility';
    type: SeatType;
    status: SeatStatus;
    price: number | null;     // null = included in fare
    currency: string;
    serviceId: string | null; // Duffel service ID — needed when creating order
    extraLegroom: boolean;
    isExit: boolean;
}

export interface SeatRow {
    rowNumber: number;
    sections: NormalizedSeat[][];  // sections separated by aisles
}

export interface NormalizedSegmentSeatMap {
    segmentIndex: number;
    segmentId: string;
    origin: string;
    destination: string;
    cabinClass: string;
    rows: SeatRow[];
    columnHeaders: string[][];  // per-section column labels e.g. [["A","B","C"],["D","E","F"]]
}

// ─── Selection state ─────────────────────────────────────────────────

export interface SelectedSeat {
    passengerIndex: number;
    segmentIndex: number;
    designator: string;
    serviceId: string;
    price: number;
    currency: string;
}

// ─── Duffel raw types (partial) ──────────────────────────────────────

export interface DuffelSeatMapEntry {
    id: string;
    segment_id: string;
    cabins: DuffelCabin[];
}

export interface DuffelCabin {
    cabin_class: string;
    deck: number;
    rows: DuffelRow[];
}

export interface DuffelRow {
    sections: DuffelSection[];
}

export interface DuffelSection {
    elements: DuffelElement[];
}

export interface DuffelElement {
    type: string;          // "seat" | "empty" | "lavatory" | "galley" | "stairs" | "exit_row" | "bassinet" | "wing"
    designator?: string;   // only for type "seat"
    available_services: DuffelSeatService[];
    disclosures: string[];
}

export interface DuffelSeatService {
    id: string;
    total_amount: string;
    total_currency: string;
}
