export default function Loading() {
    return (
        <div className="space-y-4">
            <div className="h-7 w-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
            <div className="h-[60dvh] animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        </div>
    );
}
