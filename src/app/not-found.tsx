import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '404 – Page Not Found | CheapestGo',
  description: "The page you're looking for doesn't exist. Head back to CheapestGo and keep exploring.",
};

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center bg-white dark:bg-slate-950">
      <p className="text-[80px] sm:text-[120px] font-display font-black text-blue-600 leading-none select-none">
        404
      </p>
      <h1 className="mt-4 text-xl sm:text-2xl font-display font-bold text-slate-900 dark:text-white">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-xs">
        The link may be broken, or the page may have moved. Let&apos;s get you somewhere good.
      </p>
      <div className="flex flex-wrap gap-3 mt-8 justify-center">
        <Link
          href="/"
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-full transition-colors"
        >
          Back to Home
        </Link>
        <Link
          href="/search"
          className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-full transition-colors"
        >
          Search Hotels
        </Link>
      </div>
    </div>
  );
}
