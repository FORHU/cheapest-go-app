export interface AutocompleteResult {
    type: 'city';
    title: string;
    subtitle: string;
    countryCode: string;
    id?: string;
}

// Static destination list — ONDA covers Korean accommodation + popular Asian/global destinations
const DESTINATIONS: Array<{ title: string; subtitle: string; countryCode: string }> = [
    // South Korea
    { title: 'Seoul', subtitle: 'Seoul, South Korea', countryCode: 'KR' },
    { title: 'Busan', subtitle: 'Busan, South Korea', countryCode: 'KR' },
    { title: 'Jeju', subtitle: 'Jeju Island, South Korea', countryCode: 'KR' },
    { title: 'Incheon', subtitle: 'Incheon, South Korea', countryCode: 'KR' },
    { title: 'Gyeongju', subtitle: 'Gyeongju, South Korea', countryCode: 'KR' },
    { title: 'Gangneung', subtitle: 'Gangneung, South Korea', countryCode: 'KR' },
    { title: 'Sokcho', subtitle: 'Sokcho, South Korea', countryCode: 'KR' },
    { title: 'Daegu', subtitle: 'Daegu, South Korea', countryCode: 'KR' },
    { title: 'Daejeon', subtitle: 'Daejeon, South Korea', countryCode: 'KR' },
    { title: 'Suwon', subtitle: 'Suwon, South Korea', countryCode: 'KR' },
    { title: 'Jeonju', subtitle: 'Jeonju, South Korea', countryCode: 'KR' },
    { title: 'Yeosu', subtitle: 'Yeosu, South Korea', countryCode: 'KR' },
    { title: 'Gwangju', subtitle: 'Gwangju, South Korea', countryCode: 'KR' },
    { title: 'Chuncheon', subtitle: 'Chuncheon, South Korea', countryCode: 'KR' },
    { title: 'Pyeongchang', subtitle: 'Pyeongchang, South Korea', countryCode: 'KR' },
    { title: 'Gapyeong', subtitle: 'Gapyeong, South Korea', countryCode: 'KR' },
    // Philippines
    { title: 'Manila', subtitle: 'Manila, Philippines', countryCode: 'PH' },
    { title: 'Cebu City', subtitle: 'Cebu, Philippines', countryCode: 'PH' },
    { title: 'Boracay', subtitle: 'Aklan, Philippines', countryCode: 'PH' },
    { title: 'Palawan', subtitle: 'Palawan, Philippines', countryCode: 'PH' },
    { title: 'El Nido', subtitle: 'Palawan, Philippines', countryCode: 'PH' },
    { title: 'Davao', subtitle: 'Davao del Sur, Philippines', countryCode: 'PH' },
    { title: 'Baguio', subtitle: 'Benguet, Philippines', countryCode: 'PH' },
    { title: 'Siargao', subtitle: 'Surigao del Norte, Philippines', countryCode: 'PH' },
    { title: 'Bohol', subtitle: 'Bohol, Philippines', countryCode: 'PH' },
    { title: 'Makati', subtitle: 'Metro Manila, Philippines', countryCode: 'PH' },
    // Japan
    { title: 'Tokyo', subtitle: 'Tokyo, Japan', countryCode: 'JP' },
    { title: 'Osaka', subtitle: 'Osaka, Japan', countryCode: 'JP' },
    { title: 'Kyoto', subtitle: 'Kyoto, Japan', countryCode: 'JP' },
    { title: 'Sapporo', subtitle: 'Hokkaido, Japan', countryCode: 'JP' },
    { title: 'Fukuoka', subtitle: 'Fukuoka, Japan', countryCode: 'JP' },
    { title: 'Hiroshima', subtitle: 'Hiroshima, Japan', countryCode: 'JP' },
    { title: 'Nara', subtitle: 'Nara, Japan', countryCode: 'JP' },
    { title: 'Okinawa', subtitle: 'Okinawa, Japan', countryCode: 'JP' },
    // Thailand
    { title: 'Bangkok', subtitle: 'Bangkok, Thailand', countryCode: 'TH' },
    { title: 'Phuket', subtitle: 'Phuket, Thailand', countryCode: 'TH' },
    { title: 'Chiang Mai', subtitle: 'Chiang Mai, Thailand', countryCode: 'TH' },
    { title: 'Pattaya', subtitle: 'Chonburi, Thailand', countryCode: 'TH' },
    { title: 'Koh Samui', subtitle: 'Surat Thani, Thailand', countryCode: 'TH' },
    { title: 'Krabi', subtitle: 'Krabi, Thailand', countryCode: 'TH' },
    // Vietnam
    { title: 'Hanoi', subtitle: 'Hanoi, Vietnam', countryCode: 'VN' },
    { title: 'Ho Chi Minh City', subtitle: 'Ho Chi Minh City, Vietnam', countryCode: 'VN' },
    { title: 'Da Nang', subtitle: 'Da Nang, Vietnam', countryCode: 'VN' },
    { title: 'Hoi An', subtitle: 'Quang Nam, Vietnam', countryCode: 'VN' },
    { title: 'Nha Trang', subtitle: 'Khanh Hoa, Vietnam', countryCode: 'VN' },
    { title: 'Phu Quoc', subtitle: 'Kien Giang, Vietnam', countryCode: 'VN' },
    // Indonesia
    { title: 'Bali', subtitle: 'Bali, Indonesia', countryCode: 'ID' },
    { title: 'Jakarta', subtitle: 'Jakarta, Indonesia', countryCode: 'ID' },
    { title: 'Lombok', subtitle: 'West Nusa Tenggara, Indonesia', countryCode: 'ID' },
    { title: 'Yogyakarta', subtitle: 'Yogyakarta, Indonesia', countryCode: 'ID' },
    // Malaysia / Singapore
    { title: 'Kuala Lumpur', subtitle: 'Kuala Lumpur, Malaysia', countryCode: 'MY' },
    { title: 'Penang', subtitle: 'Penang, Malaysia', countryCode: 'MY' },
    { title: 'Langkawi', subtitle: 'Kedah, Malaysia', countryCode: 'MY' },
    { title: 'Kota Kinabalu', subtitle: 'Sabah, Malaysia', countryCode: 'MY' },
    { title: 'Singapore', subtitle: 'Singapore', countryCode: 'SG' },
    // Taiwan
    { title: 'Taipei', subtitle: 'Taipei, Taiwan', countryCode: 'TW' },
    { title: 'Kaohsiung', subtitle: 'Kaohsiung, Taiwan', countryCode: 'TW' },
    // Other Asia
    { title: 'Hong Kong', subtitle: 'Hong Kong SAR', countryCode: 'HK' },
    { title: 'Macau', subtitle: 'Macau SAR', countryCode: 'MO' },
    { title: 'Colombo', subtitle: 'Western Province, Sri Lanka', countryCode: 'LK' },
    { title: 'Kathmandu', subtitle: 'Bagmati Province, Nepal', countryCode: 'NP' },
    { title: 'Delhi', subtitle: 'Delhi, India', countryCode: 'IN' },
    { title: 'Mumbai', subtitle: 'Maharashtra, India', countryCode: 'IN' },
    { title: 'Goa', subtitle: 'Goa, India', countryCode: 'IN' },
    // Middle East
    { title: 'Dubai', subtitle: 'Dubai, United Arab Emirates', countryCode: 'AE' },
    { title: 'Abu Dhabi', subtitle: 'Abu Dhabi, United Arab Emirates', countryCode: 'AE' },
    { title: 'Doha', subtitle: 'Doha, Qatar', countryCode: 'QA' },
    { title: 'Istanbul', subtitle: 'Istanbul, Turkey', countryCode: 'TR' },
    // Europe
    { title: 'London', subtitle: 'England, United Kingdom', countryCode: 'GB' },
    { title: 'Paris', subtitle: 'Île-de-France, France', countryCode: 'FR' },
    { title: 'Amsterdam', subtitle: 'North Holland, Netherlands', countryCode: 'NL' },
    { title: 'Barcelona', subtitle: 'Catalonia, Spain', countryCode: 'ES' },
    { title: 'Rome', subtitle: 'Lazio, Italy', countryCode: 'IT' },
    { title: 'Berlin', subtitle: 'Berlin, Germany', countryCode: 'DE' },
    { title: 'Vienna', subtitle: 'Vienna, Austria', countryCode: 'AT' },
    { title: 'Prague', subtitle: 'Bohemia, Czech Republic', countryCode: 'CZ' },
    { title: 'Budapest', subtitle: 'Central Hungary, Hungary', countryCode: 'HU' },
    { title: 'Lisbon', subtitle: 'Lisbon, Portugal', countryCode: 'PT' },
    // Americas
    { title: 'New York', subtitle: 'New York, United States', countryCode: 'US' },
    { title: 'Los Angeles', subtitle: 'California, United States', countryCode: 'US' },
    { title: 'Miami', subtitle: 'Florida, United States', countryCode: 'US' },
    { title: 'Toronto', subtitle: 'Ontario, Canada', countryCode: 'CA' },
    { title: 'Vancouver', subtitle: 'British Columbia, Canada', countryCode: 'CA' },
    { title: 'Cancun', subtitle: 'Quintana Roo, Mexico', countryCode: 'MX' },
    // Oceania
    { title: 'Sydney', subtitle: 'New South Wales, Australia', countryCode: 'AU' },
    { title: 'Melbourne', subtitle: 'Victoria, Australia', countryCode: 'AU' },
    { title: 'Auckland', subtitle: 'Auckland, New Zealand', countryCode: 'NZ' },
];

export async function autocompleteDestinations(
    query: string
): Promise<{ success: true; data: AutocompleteResult[] } | { success: false; error: string }> {
    if (!query || query.length < 2) {
        return { success: true, data: [] };
    }

    const q = query.toLowerCase().trim();
    const matches = DESTINATIONS.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.subtitle.toLowerCase().includes(q)
    ).slice(0, 8);

    return {
        success: true,
        data: matches.map(d => ({ type: 'city' as const, ...d })),
    };
}
