import { cookies } from 'next/headers';

export const ADMIN_BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo';

const VALID_BRANDS = ['CheapestGo', 'GeomeeGo', 'all'] as const;
export type AdminBrand = (typeof VALID_BRANDS)[number];

export async function getAdminBrand(): Promise<AdminBrand> {
    try {
        const cookieStore = await cookies();
        const brand = cookieStore.get('admin_brand_view')?.value;
        if (brand && (VALID_BRANDS as readonly string[]).includes(brand)) {
            return brand as AdminBrand;
        }
    } catch {
        // cookies() throws during build-time static generation
    }
    return ADMIN_BRAND as AdminBrand;
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
    return query.eq('source_brand', brand);
}
