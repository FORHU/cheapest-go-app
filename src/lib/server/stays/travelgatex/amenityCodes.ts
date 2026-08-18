/**
 * Maps OTV (RateHawk/TravelgateX) amenity codes to user-facing labels.
 * Codes come from the hotelX.hotels portfolio query AmenityStatic.code field.
 * Fallback: unknown codes are prettified (underscores → spaces, title-cased).
 */
const OTV_AMENITY_MAP: Record<string, string> = {
    // Wi-Fi
    FREE_WIFI: 'Free WiFi',
    WIFI_GRATIS: 'Free WiFi',
    WIFI: 'WiFi',
    WIRELESS_INTERNET: 'Free WiFi',
    INTERNET: 'Internet',
    HIGH_SPEED_INTERNET: 'High-Speed Internet',

    // Parking
    FREE_PARKING: 'Free Parking',
    PARKING_GRATIS: 'Free Parking',
    PARKING: 'Parking',
    VALET_PARKING: 'Valet Parking',
    SECURE_PARKING: 'Secure Parking',
    UNDERGROUND_PARKING: 'Underground Parking',
    CAR_PARK: 'Parking',

    // Pool
    SWIMMING_POOL: 'Swimming Pool',
    POOL: 'Swimming Pool',
    INDOOR_POOL: 'Indoor Pool',
    OUTDOOR_POOL: 'Outdoor Pool',
    HEATED_POOL: 'Heated Pool',
    ROOFTOP_POOL: 'Rooftop Pool',

    // Fitness
    GYM: 'Fitness Center',
    FITNESS_CENTER: 'Fitness Center',
    FITNESS_ROOM: 'Fitness Center',
    FITNESS: 'Fitness Center',
    SAUNA: 'Sauna',
    SPA: 'Spa',
    HOT_TUB: 'Hot Tub',
    JACUZZI: 'Jacuzzi',
    STEAM_ROOM: 'Steam Room',

    // Food & Drink
    RESTAURANT: 'Restaurant',
    BAR: 'Bar',
    HOTEL_BAR: 'Bar',
    BREAKFAST: 'Breakfast Available',
    BREAKFAST_INCLUDED: 'Breakfast Included',
    BREAKFAST_BUFFET: 'Buffet Breakfast',
    ROOM_SERVICE: 'Room Service',
    MINIBAR: 'Minibar',
    KITCHEN: 'Kitchen',
    KITCHENETTE: 'Kitchenette',
    COFFEE_MAKER: 'Coffee Maker',
    SNACK_BAR: 'Snack Bar',

    // Rooms
    AIR_CONDITIONING: 'Air Conditioning',
    AIR_COND: 'Air Conditioning',
    HEATING: 'Heating',
    BALCONY: 'Balcony',
    TERRACE: 'Terrace',
    SEA_VIEW: 'Sea View',
    CITY_VIEW: 'City View',
    GARDEN_VIEW: 'Garden View',
    IN_ROOM_SAFE: 'In-Room Safe',
    SAFE: 'In-Room Safe',
    TV: 'TV',
    FLAT_SCREEN_TV: 'Flat-Screen TV',

    // Services
    CONCIERGE: 'Concierge',
    RECEPTION_24H: '24/7 Reception',
    RECEPTION_24_HOURS: '24/7 Reception',
    FRONT_DESK_24H: '24/7 Reception',
    LAUNDRY: 'Laundry Service',
    LAUNDRY_SERVICE: 'Laundry Service',
    DRY_CLEANING: 'Dry Cleaning',
    LUGGAGE_STORAGE: 'Luggage Storage',
    AIRPORT_TRANSFER: 'Airport Transfer',
    SHUTTLE: 'Shuttle Service',
    TOUR_DESK: 'Tour Desk',
    ROOM_CLEANING: 'Daily Housekeeping',

    // Business
    BUSINESS_CENTER: 'Business Center',
    MEETING_ROOMS: 'Meeting Rooms',
    CONFERENCE: 'Conference Facilities',

    // Accessibility
    WHEELCHAIR: 'Wheelchair Accessible',
    WHEELCHAIR_ACCESSIBLE: 'Wheelchair Accessible',
    DISABLED_FACILITIES: 'Disabled Facilities',
    ELEVATOR: 'Elevator',
    LIFT: 'Elevator',

    // Policies
    NON_SMOKING: 'Non-Smoking Rooms',
    PET_FRIENDLY: 'Pet Friendly',
    PETS_ALLOWED: 'Pet Friendly',
    FAMILY_ROOMS: 'Family Rooms',
    SMOKE_FREE: 'Smoke-Free Property',

    // Outdoors
    GARDEN: 'Garden',
    BBQ: 'BBQ Facilities',
    SUN_TERRACE: 'Sun Terrace',
    BEACH_ACCESS: 'Beach Access',
    PRIVATE_BEACH: 'Private Beach',

    // Misc
    EXPRESS_CHECKIN: 'Express Check-in',
    EARLY_CHECKIN: 'Early Check-in',
    LATE_CHECKOUT: 'Late Check-out',
    LOCKER: 'Lockers',
    ATM: 'ATM on Site',
    GIFT_SHOP: 'Gift Shop',
    NEWSSTAND: 'Newsstand',
    MULTILINGUAL_STAFF: 'Multilingual Staff',

    // Spanish TGX supplier codes
    AIRE_ACONDICIONADO: 'Air Conditioning',
    ASCENSOR: 'Elevator',
    ZONAS_PARA_FUMADORES: 'Smoking Areas',
    ALOJAMIENTO_PARA_NO_FUMADORES: 'Non-Smoking Rooms',
    GUARDIA_DE_SEGURIDAD: 'Security Guard',
    TELEVISION_EN_EL_VESTIBULO: 'Lobby TV',
    PISCINA: 'Swimming Pool',
    PISCINA_CUBIERTA: 'Indoor Pool',
    PISCINA_AL_AIRE_LIBRE: 'Outdoor Pool',
    RESTAURANTE: 'Restaurant',
    GIMNASIO: 'Fitness Center',
    RECEPCION_24_HORAS: '24/7 Reception',
    ESTACIONAMIENTO: 'Parking',
    APARCAMIENTO: 'Parking',
    APARCAMIENTO_GRATUITO: 'Free Parking',
    SERVICIO_DE_HABITACIONES: 'Room Service',
    JARDIN: 'Garden',
    TERRAZA: 'Terrace',
    CAJA_FUERTE: 'In-Room Safe',
    CAJA_DE_SEGURIDAD: 'In-Room Safe',
    SERVICIO_DE_LAVANDERIA: 'Laundry Service',
    LAVANDERIA: 'Laundry Service',
    DESAYUNO_INCLUIDO: 'Breakfast Included',
    DESAYUNO_DISPONIBLE: 'Breakfast Available',
    COCINA: 'Kitchen',
    COCINA_AMERICANA: 'Kitchenette',
    INTERNET_GRATUITO: 'Free WiFi',
    INTERNET_DE_ALTA_VELOCIDAD: 'High-Speed Internet',
    CALEFACCION: 'Heating',
    BALCON: 'Balcony',
    VISTA_AL_MAR: 'Sea View',
    VISTA_A_LA_CIUDAD: 'City View',
    VISTA_AL_JARDIN: 'Garden View',
    ACCESO_A_LA_PLAYA: 'Beach Access',
    PLAYA_PRIVADA: 'Private Beach',
    CONSERJERIA: 'Concierge',
    TRASLADO_AL_AEROPUERTO: 'Airport Transfer',
    ALMACENAMIENTO_DE_EQUIPAJE: 'Luggage Storage',
    ACCESO_PARA_SILLA_DE_RUEDAS: 'Wheelchair Accessible',
    INSTALACIONES_PARA_DISCAPACITADOS: 'Disabled Facilities',
    INSTALACIONES_DE_NEGOCIOS: 'Business Center',
    SALA_DE_REUNIONES: 'Meeting Rooms',
    LIMPIEZA_DIARIA: 'Daily Housekeeping',
    TV_PANTALLA_PLANA: 'Flat-Screen TV',
    MASCOTAS_PERMITIDAS: 'Pet Friendly',
    HABITACIONES_FAMILIARES: 'Family Rooms',
    BARBACOA: 'BBQ Facilities',
    TERRAZA_DE_SOL: 'Sun Terrace',

    // German TGX supplier codes
    AUFZUG: 'Elevator',
    KLIMAANLAGE: 'Air Conditioning',
    KOSTENLOSER_PARKPLATZ: 'Free Parking',
    PARKPLATZ: 'Parking',
    SCHWIMMBAD: 'Swimming Pool',
    FITNESSCENTER: 'Fitness Center',
    FRUHSTUCK: 'Breakfast Available',
    FRUHSTUCK_INKLUSIVE: 'Breakfast Included',
    ZIMMERSERVICE: 'Room Service',
    KUCHE: 'Kitchen',
    KUCHENZEILE: 'Kitchenette',
    KOSTENLOSES_WLAN: 'Free WiFi',
    WLAN: 'WiFi',
    HEIZUNG: 'Heating',
    BALKON: 'Balcony',
    MEERBLICK: 'Sea View',
    STADTBLICK: 'City View',
    GARTENBLICK: 'Garden View',
    NICHTRAUCHERZIMMER: 'Non-Smoking Rooms',
    HAUSTIERE_ERLAUBT: 'Pet Friendly',
    FAMILIENZIMMER: 'Family Rooms',
    GEPACK_AUFBEWAHRUNG: 'Luggage Storage',
    FLUGHAFENTRANSFER: 'Airport Transfer',
    ROLLSTUHLGERECHT: 'Wheelchair Accessible',
    BEHINDERTENGERECHTE_EINRICHTUNGEN: 'Disabled Facilities',
    BUSINESSCENTER: 'Business Center',
    KONFERENZRAUME: 'Meeting Rooms',
    TAGLICHE_ZIMMERREINIGUNG: 'Daily Housekeeping',
    WASCHESERVICE: 'Laundry Service',
    GARTENANLAGE: 'Garden',
    SONNENTERRASSE: 'Sun Terrace',
    STRANDLAGE: 'Beach Access',
    PRIVATSTRAND: 'Private Beach',
    CONCIERGE_SERVICE: 'Concierge',
    GELDAUTOMAT: 'ATM on Site',
};

/** Convert an OTV amenity code to a display label. Unknown codes are prettified. */
export function otvCodeToLabel(code: string | null | undefined): string {
    if (!code) return '';
    const upper = code.toUpperCase().trim();
    if (OTV_AMENITY_MAP[upper]) return OTV_AMENITY_MAP[upper];
    // Fallback: replace underscores/hyphens with spaces, title-case each word
    return upper
        .replace(/[_-]+/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Re-translates already-stored amenity display strings that were prettified
 * from non-English codes (e.g. "Aire Acondicionado" → "Air Conditioning").
 * Reverses the fallback prettifier: strips accents, uppercases, replaces spaces
 * with underscores, then looks up in the map.
 */
export function normalizeStoredAmenity(label: string): string {
    if (!label) return label;
    const asCode = label
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
        .toUpperCase()
        .replace(/\s+/g, '_');
    return OTV_AMENITY_MAP[asCode] || label;
}
