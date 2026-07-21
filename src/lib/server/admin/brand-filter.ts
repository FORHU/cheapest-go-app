export const ADMIN_BRAND = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo';

/**
 * Scopes any Supabase query to the current brand's rows.
 * CheapestGo also captures legacy rows where source_brand IS NULL
 * (created before the column existed).
 */
export function applyBrandFilter(query: any): any {
    if (ADMIN_BRAND === 'CheapestGo') {
        return query.or('source_brand.eq.CheapestGo,source_brand.is.null');
    }
    return query.eq('source_brand', ADMIN_BRAND);
}
