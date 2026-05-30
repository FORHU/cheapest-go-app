import { Skeleton } from '@/components/ui';

export default function TravelgateXLoading() {
    return (
        <div className="space-y-10 pb-20 animate-in fade-in duration-500">
            {/* Header row */}
            <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-32 rounded-xl" />
                <Skeleton className="h-8 w-24 rounded-xl" />
                <Skeleton className="h-8 w-28 ml-auto rounded-xl" />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-28 w-full rounded-2xl" />
                ))}
            </div>

            {/* Config + status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Skeleton className="h-56 w-full rounded-2xl" />
                <Skeleton className="h-56 w-full rounded-2xl" />
            </div>

            {/* Bookings table */}
            <Skeleton className="h-72 w-full rounded-2xl" />

            {/* API logs */}
            <Skeleton className="h-52 w-full rounded-2xl" />
        </div>
    );
}
