import { Skeleton } from '@/components/ui';

export default function StripeLoading() {
    return (
        <div className="space-y-10 pb-20 animate-in fade-in duration-500">
            {/* Mode badge */}
            <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-28 rounded-xl" />
                <Skeleton className="h-5 w-36 rounded-lg" />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-28 w-full rounded-2xl" />
                ))}
            </div>

            {/* Balance panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Skeleton className="h-40 w-full rounded-2xl" />
                <Skeleton className="h-40 w-full rounded-2xl" />
            </div>

            {/* Tab bar */}
            <div className="space-y-4">
                <Skeleton className="h-11 w-80 rounded-2xl" />
                <Skeleton className="h-72 w-full rounded-2xl" />
            </div>
        </div>
    );
}
