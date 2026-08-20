'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { POPULAR_DESTINATIONS } from '@/lib/constants/destinations';
import { useDragScroll } from '@/hooks/useDragScroll';
import { useTranslations } from 'next-intl';

function localDate(offset: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function PopularDestinationsSection() {
    const { ref, dragProps } = useDragScroll<HTMLDivElement>();
    const t = useTranslations('popularDestinations');
    const checkIn = localDate(0);
    const checkOut = localDate(1);

    const scroll = (dir: 'left' | 'right') => {
        ref.current?.scrollBy({ left: dir === 'left' ? -480 : 480, behavior: 'smooth' });
    };

    return (
        <section className="w-full py-8 md:py-12">
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 flex items-start justify-between mb-5">
                <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-1">
                        {t('title')}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base">
                        {t('subtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 mt-1">
                    <button
                        onClick={() => scroll('left')}
                        className="p-2 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
                        aria-label="Scroll left"
                    >
                        <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    </button>
                    <button
                        onClick={() => scroll('right')}
                        className="p-2 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
                        aria-label="Scroll right"
                    >
                        <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    </button>
                </div>
            </div>

            <div
                ref={ref}
                {...dragProps}
                className="flex gap-3 overflow-x-auto scroll-smooth px-4 sm:px-6 pb-2"
                style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
            >
                {POPULAR_DESTINATIONS.map((dest) => (
                    <Link
                        key={dest.id}
                        href={`/search?destination=${encodeURIComponent(dest.city)}&countryCode=${dest.countryCode}&checkIn=${checkIn}&checkOut=${checkOut}`}
                        className="group relative shrink-0 w-[160px] sm:w-[200px] md:w-[220px] aspect-3/4 rounded-2xl overflow-hidden block"
                        style={{ scrollSnapAlign: 'start' }}
                    >
                        <Image
                            src={dest.imagePath}
                            alt={`${dest.city}, ${dest.country}`}
                            fill
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                            sizes="(max-width: 640px) 160px, (max-width: 1024px) 200px, 220px"
                            draggable={false}
                        />
                        <div className="absolute inset-0 bg-linear-to-t from-black/65 via-black/10 to-transparent" />
                        <div className="absolute bottom-0 left-0 p-3">
                            <p className="text-white font-semibold text-sm leading-tight">
                                {dest.city}
                            </p>
                            <p className="text-white/75 text-xs mt-0.5">
                                {dest.country}
                            </p>
                        </div>
                    </Link>
                ))}
            </div>
        </section>
    );
}
