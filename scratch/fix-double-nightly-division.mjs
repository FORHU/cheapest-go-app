/**
 * Remove the second division of an already-per-night search price.
 *
 * `/api/search/stream` divides the supplier's stay total by nights before sending it, and
 * seven display sites divided again — so every multi-night search showed half the real
 * nightly rate. Each replacement below leaves the currency conversion and drops only the
 * `/ nights`.
 *
 *   node scratch/fix-double-nightly-division.mjs
 */
import fs from 'fs';

/** file -> [ [find, replace], ... ] */
const EDITS = {
    'src/components/map/PropertyMapView.tsx': [
        [
            'prices[p.id] = toPerNight(p.price, p.currency, targetCurrency, nights);',
            'prices[p.id] = convertCurrency(p.price, p.currency || \'USD\', targetCurrency);',
        ],
        ["import { toPerNight } from '@/lib/perNightPrice';\n", ''],
    ],
    'src/components/mapbox/SearchMapContainer.tsx': [
        [
            'prices[p.id] = toPerNight(p.price, p.currency, targetCurrency, nights);',
            'prices[p.id] = convertCurrency(p.price, p.currency || \'USD\', targetCurrency);',
        ],
        ["import { toPerNight } from '@/lib/perNightPrice';\n", ''],
    ],
    'src/components/search/SearchListWithMap.tsx': [
        [
            'prices[p.id] = toPerNight(p.price, p.currency, targetCurrency, nights);',
            'prices[p.id] = convertCurrency(p.price, p.currency || \'USD\', targetCurrency);',
        ],
        ["import { toPerNight } from '@/lib/perNightPrice';\n", ''],
    ],
    'src/components/mapbox/components/SelectedPropertyPopup.tsx': [
        [
            'displayPrice={toPerNight(selectedProperty.price, selectedProperty.currency, targetCurrency, nights)}',
            "displayPrice={convertCurrency(selectedProperty.price, selectedProperty.currency || 'USD', targetCurrency)}",
        ],
        ["import { toPerNight } from '@/lib/perNightPrice';\n", ''],
    ],
    'src/components/shared/PropertyCard/PropertyCard.tsx': [
        [
            'const displayPrice = mounted ? convertCurrency(property.price, sourceCurrency, targetCurrency) / nights : property.price;',
            'const displayPrice = mounted ? convertCurrency(property.price, sourceCurrency, targetCurrency) : property.price;',
        ],
        [
            '? (mounted ? convertCurrency(property.originalPrice, sourceCurrency, targetCurrency) / nights : property.originalPrice)',
            '? (mounted ? convertCurrency(property.originalPrice, sourceCurrency, targetCurrency) : property.originalPrice)',
        ],
    ],
    'src/components/map/MapPopup.tsx': [
        [
            '() => convertCurrency(property.price, sourceCurrency, targetCurrency) / nights,',
            '() => convertCurrency(property.price, sourceCurrency, targetCurrency),',
        ],
        [
            '? convertCurrency(property.originalPrice, sourceCurrency, targetCurrency) / nights',
            '? convertCurrency(property.originalPrice, sourceCurrency, targetCurrency)',
        ],
    ],
    'src/components/map/MapPropertyCard.tsx': [
        [
            '() => convertCurrency(property.price, sourceCurrency, targetCurrency) / nights,',
            '() => convertCurrency(property.price, sourceCurrency, targetCurrency),',
        ],
        [
            '? convertCurrency(property.originalPrice, sourceCurrency, targetCurrency) / nights',
            '? convertCurrency(property.originalPrice, sourceCurrency, targetCurrency)',
        ],
    ],
};

let failures = 0;
for (const [file, edits] of Object.entries(EDITS)) {
    let source = fs.readFileSync(file, 'utf8');
    let applied = 0;

    for (const [find, replace] of edits) {
        if (!source.includes(find)) {
            // An edit that silently matches nothing is how half of these would stay broken.
            console.log(`  MISS  ${file}\n        ${find.slice(0, 70)}`);
            failures++;
            continue;
        }
        source = source.split(find).join(replace);
        applied++;
    }

    fs.writeFileSync(file, source);
    console.log(`  ${String(applied).padStart(2)} edit(s)  ${file}`);
}

console.log(failures ? `\n${failures} edit(s) matched nothing — check by hand.` : '\nall edits applied');
process.exit(failures ? 1 : 0);
