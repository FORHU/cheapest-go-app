/**
 * Compatibility shim — redirects to the new functions utility.
 *
 * The original version called ${SUPABASE_URL}/functions/v1/{name}.
 * The new version calls ${FUNCTIONS_BASE_URL}/api/fn/{name} which proxies
 * to either self-hosted Edge Functions or dedicated Next.js API routes.
 *
 * All importers of '@/utils/supabase/functions' now automatically use
 * the Supabase-free implementation without any code changes at call sites.
 */
export {
    invokeEdgeFunction,
    searchLiteApi,
    preBook,
    getHotelDetails,
} from '@/utils/postgres/functions';
