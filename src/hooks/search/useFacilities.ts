import { useQuery } from '@tanstack/react-query';
import { liteApiService } from '@/services';
import type { LiteApiFacility } from '@/services';
import { queryKeys } from '@/lib/queryClient';
import { FACILITIES } from '@/lib/constants';

/**
 * Fetch the full facilities list from LiteAPI.
 * Cached for the entire session (staleTime: Infinity).
 * Falls back to the hardcoded FACILITIES constant while loading or on error.
 */
export function useFacilities() {
    const query = useQuery<LiteApiFacility[]>({
        queryKey: queryKeys.facilities.all,
        queryFn: () => liteApiService.getFacilities(),
        staleTime: Infinity,
    });

    const facilities: Array<{ id: number; name: string }> = query.data && query.data.length > 0
        ? query.data
        : FACILITIES.map((f) => ({ id: f.id, name: f.label }));

    return {
        facilities,
        isLoading: query.isLoading,
        isError: query.isError,
    };
}
