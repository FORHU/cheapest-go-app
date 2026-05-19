export const CITY_CENTERS_STATIC: Record<string, { lat: number; lng: number }> = {
  // Asia-Pacific
  'tokyo': { lat: 35.6762, lng: 139.6503 },
  'osaka': { lat: 34.6937, lng: 135.5023 },
  'kyoto': { lat: 35.0116, lng: 135.7681 },
  'sapporo': { lat: 43.0618, lng: 141.3545 },
  'fukuoka': { lat: 33.5904, lng: 130.4017 },
  'hiroshima': { lat: 34.3853, lng: 132.4553 },
  'nara': { lat: 34.6851, lng: 135.8048 },
  'seoul': { lat: 37.5665, lng: 126.9780 },
  'busan': { lat: 35.1796, lng: 129.0756 },
  'jeju': { lat: 33.4996, lng: 126.5312 },
  'daejeon': { lat: 36.3504, lng: 127.3845 },
  'daegu': { lat: 35.8714, lng: 128.6014 },
  'gwangju': { lat: 35.1595, lng: 126.8526 },
  'ulsan': { lat: 35.5384, lng: 129.3114 },
  'incheon': { lat: 37.4563, lng: 126.7052 },
  'suwon': { lat: 37.2636, lng: 127.0286 },
  'jeonju': { lat: 35.8242, lng: 127.1480 },
  'gyeongju': { lat: 35.8562, lng: 129.2247 },
  'gangneung': { lat: 37.7519, lng: 128.8761 },
  'sokcho': { lat: 38.2070, lng: 128.5918 },
  'bangkok': { lat: 13.7563, lng: 100.5018 },
  'phuket': { lat: 7.8804, lng: 98.3923 },
  'chiang mai': { lat: 18.7883, lng: 98.9853 },
  'pattaya': { lat: 12.9236, lng: 100.8825 },
  'singapore': { lat: 1.3521, lng: 103.8198 },
  'kuala lumpur': { lat: 3.1390, lng: 101.6869 },
  'penang': { lat: 5.4141, lng: 100.3288 },
  'langkawi': { lat: 6.3500, lng: 99.8000 },
  'ho chi minh': { lat: 10.8231, lng: 106.6297 },
  'hanoi': { lat: 21.0285, lng: 105.8542 },
  'da nang': { lat: 16.0544, lng: 108.2022 },
  'bali': { lat: -8.4095, lng: 115.1889 },
  'jakarta': { lat: -6.2088, lng: 106.8456 },
  'yogyakarta': { lat: -7.7956, lng: 110.3695 },
  'manila': { lat: 14.5995, lng: 120.9842 },
  'cebu': { lat: 10.3157, lng: 123.8854 },
  'boracay': { lat: 11.9674, lng: 121.9248 },
  'hong kong': { lat: 22.3193, lng: 114.1694 },
  'taipei': { lat: 25.0330, lng: 121.5654 },
  'beijing': { lat: 39.9042, lng: 116.4074 },
  'shanghai': { lat: 31.2304, lng: 121.4737 },
  'guangzhou': { lat: 23.1291, lng: 113.2644 },
  'shenzhen': { lat: 22.5431, lng: 114.0579 },
  'mumbai': { lat: 19.0760, lng: 72.8777 },
  'delhi': { lat: 28.6139, lng: 77.2090 },
  'goa': { lat: 15.2993, lng: 74.1240 },
  'colombo': { lat: 6.9271, lng: 79.8612 },
  'kathmandu': { lat: 27.7172, lng: 85.3240 },
  'dhaka': { lat: 23.8103, lng: 90.4125 },
  'sydney': { lat: -33.8688, lng: 151.2093 },
  'melbourne': { lat: -37.8136, lng: 144.9631 },
  'brisbane': { lat: -27.4698, lng: 153.0251 },
  'auckland': { lat: -36.8509, lng: 174.7645 },
  // Middle East
  'dubai': { lat: 25.2048, lng: 55.2708 },
  'abu dhabi': { lat: 24.4539, lng: 54.3773 },
  'doha': { lat: 25.2854, lng: 51.5310 },
  'istanbul': { lat: 41.0082, lng: 28.9784 },
  'riyadh': { lat: 24.7136, lng: 46.6753 },
  // Europe
  'london': { lat: 51.5074, lng: -0.1278 },
  'paris': { lat: 48.8566, lng: 2.3522 },
  'amsterdam': { lat: 52.3676, lng: 4.9041 },
  'berlin': { lat: 52.5200, lng: 13.4050 },
  'frankfurt': { lat: 50.1109, lng: 8.6821 },
  'munich': { lat: 48.1351, lng: 11.5820 },
  'rome': { lat: 41.9028, lng: 12.4964 },
  'milan': { lat: 45.4642, lng: 9.1900 },
  'madrid': { lat: 40.4168, lng: -3.7038 },
  'barcelona': { lat: 41.3851, lng: 2.1734 },
  'lisbon': { lat: 38.7223, lng: -9.1393 },
  'vienna': { lat: 48.2082, lng: 16.3738 },
  'zurich': { lat: 47.3769, lng: 8.5417 },
  'athens': { lat: 37.9838, lng: 23.7275 },
  'prague': { lat: 50.0755, lng: 14.4378 },
  'budapest': { lat: 47.4979, lng: 19.0402 },
  'warsaw': { lat: 52.2297, lng: 21.0122 },
  'stockholm': { lat: 59.3293, lng: 18.0686 },
  'copenhagen': { lat: 55.6761, lng: 12.5683 },
  'oslo': { lat: 59.9139, lng: 10.7522 },
  'brussels': { lat: 50.8503, lng: 4.3517 },
  // Americas
  'new york': { lat: 40.7128, lng: -74.0060 },
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  'chicago': { lat: 41.8781, lng: -87.6298 },
  'miami': { lat: 25.7617, lng: -80.1918 },
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  'las vegas': { lat: 36.1699, lng: -115.1398 },
  'toronto': { lat: 43.6532, lng: -79.3832 },
  'vancouver': { lat: 49.2827, lng: -123.1207 },
  'cancun': { lat: 21.1619, lng: -86.8515 },
  'mexico city': { lat: 19.4326, lng: -99.1332 },
  'rio de janeiro': { lat: -22.9068, lng: -43.1729 },
  'buenos aires': { lat: -34.6037, lng: -58.3816 },
};

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeClusterCenter(hotels: any[]): { lat: number; lng: number } | null {
  const lats: number[] = [];
  const lngs: number[] = [];
  for (const h of hotels) {
    const { lat, lng } = h.coordinates || {};
    if (lat && lng && Math.abs(lat) > 0.1 && Math.abs(lng) > 0.1) {
      lats.push(lat);
      lngs.push(lng);
    }
  }
  if (lats.length < 3) return null;
  lats.sort((a, b) => a - b);
  lngs.sort((a, b) => a - b);
  return { lat: median(lats), lng: median(lngs) };
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
