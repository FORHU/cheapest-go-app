/** BG-8: which stored city spellings does an HK "Hong Kong" search look for?  npx tsx scratch/probe-hk-db-cities.ts */
export {};
const { resolveHotelDbCities } = await import('../src/lib/constants/cityAliases');
console.log('Hong Kong|HK →', resolveHotelDbCities('Hong Kong', 'HK'));
console.log('Kowloon|HK →', resolveHotelDbCities('Kowloon', 'HK'));
