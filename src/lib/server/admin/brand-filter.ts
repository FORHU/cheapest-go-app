import { cookies } from 'next/headers';
import { canonicalBrandName } from '@/lib/brand';

export const ADMIN_BRAND = canonicalBrandName(process.env.NEXT_PUBLIC_BRAND_NAME);

const VALID_BRANDS = ['CheapestGo', 'AirangGo', 'all'] as const;
export type AdminBrand = (typeof VALID_BRANDS)[number];

/**
 * AirangGo was called GeomeeGo until the 2026-09 rebrand. The old name survives in three
 * places this function has to absorb: `source_brand` on rows written before the migration,
 * an `admin_brand_view` cookie already in an admin's browser, and NEXT_PUBLIC_BRAND_NAME on
 * the Korean instance until it is redeployed. Mapping it here means none of those three
 * makes a booking disappear from the admin list.
 */
const LEGACY_BRAND_NAME = 'GeomeeGo';

function canonicalBrand(value: string | undefined): AdminBrand | undefined {
    if (!value) return undefined;
    if (value === LEGACY_BRAND_NAME) return 'AirangGo';
    return (VALID_BRANDS as readonly string[]).includes(value) ? (value as AdminBrand) : undefined;
}

export async function getAdminBrand(): Promise<AdminBrand> {
    try {
        const cookieStore = await cookies();
        const brand = canonicalBrand(cookieStore.get('admin_brand_view')?.value);
        if (brand) return brand;
    } catch {
        // cookies() throws during build-time static generation
    }
    return canonicalBrand(ADMIN_BRAND) ?? 'CheapestGo';
}

/**
 * Scopes any Supabase query to the given brand's rows.
 * 'all' returns unfiltered data. 'CheapestGo' also captures legacy rows
 * where source_brand IS NULL (created before the column existed).
 * Callers should resolve brand once via getAdminBrand() and pass it here.
 */
export function applyBrandFilter(query: any, brand: AdminBrand = ADMIN_BRAND as AdminBrand): any {
    if (brand === 'all') return query;
    if (brand === 'CheapestGo') {
        return query.or('source_brand.eq.CheapestGo,source_brand.is.null');
    }
    if (brand === 'AirangGo') {
        // Both spellings, for as long as either can be written — see LEGACY_BRAND_NAME.
        // An exact match here would hide every Korean booking taken between the rename
        // landing in this repo and the Korean instance being redeployed.
        return query.or(`source_brand.eq.AirangGo,source_brand.eq.${LEGACY_BRAND_NAME}`);
    }
    return query.eq('source_brand', brand);
}
