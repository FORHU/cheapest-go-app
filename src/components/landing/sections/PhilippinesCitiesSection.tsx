"use client";

import React, { useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import { useDragScroll } from '@/hooks/useDragScroll';

interface PhCity {
  name: string;
  tagline: string;
  searchQuery: string;
}

const PH_CITIES: PhCity[] = [
  { name: 'Manila',      tagline: 'Capital & Cultural Heart',            searchQuery: 'Manila, Philippines' },
  { name: 'Cebu City',   tagline: 'Queen City of the South',             searchQuery: 'Cebu City, Philippines' },
  { name: 'Davao City',  tagline: 'Largest City in Mindanao',            searchQuery: 'Davao City, Philippines' },
  { name: 'Makati',      tagline: 'Financial Capital of the Philippines',searchQuery: 'Makati, Philippines' },
  { name: 'Quezon City', tagline: 'Most Populous City in the Country',   searchQuery: 'Quezon City, Philippines' },
  { name: 'Iloilo City', tagline: 'City of Love & Heritage',             searchQuery: 'Iloilo City, Philippines' },
  { name: 'Baguio City', tagline: 'Summer Capital of the Philippines',   searchQuery: 'Baguio City, Philippines' },
  { name: 'Bacolod',     tagline: 'City of Smiles',                      searchQuery: 'Bacolod, Philippines' },
  { name: 'Tagaytay',    tagline: 'Cool Climate & Scenic Views',         searchQuery: 'Tagaytay, Philippines' },
  { name: 'Zamboanga',   tagline: 'Asia\'s Latin City',                  searchQuery: 'Zamboanga City, Philippines' },
];

function cityImageUrl(name: string): string {
  return (
    `/api/hotel-photo?q=${encodeURIComponent(name + ' Philippines city landmark')}` +
    `&fallback=${encodeURIComponent(`https://picsum.photos/seed/${encodeURIComponent(name)}/600/400`)}`
  );
}

interface CityCardProps {
  city: PhCity;
  index: number;
}

const CityCard: React.FC<CityCardProps> = ({ city, index }) => {
  const router = useRouter();

  function navigate() {
    const p = new URLSearchParams({
      destination: city.searchQuery,
      destinationType: 'city',
      country: 'Philippines',
    });
    router.push(`/search?${p.toString()}`);
  }

  return (
    <motion.div
      initial={index === 0 ? false : { opacity: 0, x: 40 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.06 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      onClick={navigate}
      className="shrink-0 snap-start cursor-pointer"
      style={{ width: 'max(160px, calc((100% - 60px) / 5))' }}
    >
      <div className="relative h-[160px] overflow-hidden rounded-sm group">
        <Image
          src={cityImageUrl(city.name)}
          alt={city.name}
          fill
          sizes="(max-width: 640px) 180px, (max-width: 768px) 200px, 240px"
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          loading={index < 2 ? 'eager' : 'lazy'}
        />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/80" />

        {/* Pin badge */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full">
          <MapPin className="w-2.5 h-2.5 text-white" />
          <span className="text-[10px] text-white leading-none">Philippines</span>
        </div>

        {/* City info */}
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-8">
          <h3 className="text-[16px] font-bold text-white leading-tight">
            {city.name}
          </h3>
          <p className="text-[10px] text-white/80 leading-snug mt-0.5 truncate">
            {city.tagline}
          </p>
        </div>

        {/* Hover explore button */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="bg-white/90 text-slate-900 text-[11px] font-semibold px-4 py-1.5 rounded-full shadow-lg">
            Explore Hotels
          </span>
        </div>
      </div>
    </motion.div>
  );
};

const PhilippinesCitiesSection: React.FC = () => {
  const { ref: rowRef, dragProps } = useDragScroll<HTMLDivElement>();
  const sectionRef = useRef<HTMLElement>(null);

  return (
    <section ref={sectionRef} className="w-full py-2 md:py-4 lg:py-5">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-display font-bold text-slate-900 dark:text-white">
              Top Cities in the{' '}
              <span className="text-blue-600 dark:text-blue-400">Philippines</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Most visited destinations · find hotels instantly
            </p>
          </div>
        </div>

        {/* Horizontal scroll */}
        <div
          ref={rowRef}
          {...dragProps}
          className="flex overflow-x-auto snap-x snap-mandatory gap-3 pt-5 pb-3 -mt-5 -mx-4 sm:-mx-6 px-4 sm:px-6 scroll-px-4 sm:scroll-px-6 cursor-grab active:cursor-grabbing select-none"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {PH_CITIES.map((city, i) => (
            <CityCard key={city.name} city={city} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
};

export default PhilippinesCitiesSection;
