"use client";

import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Star, Sparkles, Plane, MapPin } from 'lucide-react';

// =============================================================================
// 1. DISCOVER YOUR NEW FAVORITE STAY
// =============================================================================
const categories = [
  { id: 1, title: 'Apart-hotels', image: 'https://picsum.photos/seed/apart/300/200' },
  { id: 2, title: 'Family friendly', image: 'https://picsum.photos/seed/family/300/200' },
  { id: 3, title: 'Beachfront', image: 'https://picsum.photos/seed/beach/300/200' },
  { id: 4, title: 'Spa', image: 'https://picsum.photos/seed/spa/300/200' },
  { id: 5, title: 'Romantic', image: 'https://picsum.photos/seed/romantic/300/200' },
];

export const DiscoverFavoriteStay = () => {
  return (
    <section className="w-full py-12">
      <div className="max-w-[1400px] mx-auto px-6">
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white mb-6"
        >
          Discover your new favorite stay
        </motion.h2>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {categories.map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="group cursor-pointer"
            >
              <div className="relative aspect-[3/2] rounded-xl overflow-hidden mb-2">
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                  style={{ backgroundImage: `url(${cat.image})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <span className="absolute bottom-3 left-3 text-white font-semibold text-sm">
                  {cat.title}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

// =============================================================================
// YOUR RECENT SEARCHES
// =============================================================================
const recentSearches = [
  {
    id: 1,
    destination: 'Stays in Baguio',
    dates: 'Mon, Feb 9 - Fri, Feb 13',
    travelers: '2 travelers',
    rooms: '1 room',
  },
  {
    id: 2,
    destination: 'Stays in Boracay',
    dates: 'Sat, Mar 15 - Wed, Mar 19',
    travelers: '4 travelers',
    rooms: '2 rooms',
  },
  {
    id: 3,
    destination: 'Stays in Cebu',
    dates: 'Fri, Apr 4 - Sun, Apr 6',
    travelers: '2 travelers',
    rooms: '1 room',
  },
];

export const YourRecentSearches = () => {
  return (
    <section className="w-full pb-6">
      <div className="max-w-[1400px] mx-auto px-6">
        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-4"
        >
          Your recent searches
        </motion.h3>
        
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
          {recentSearches.map((search, i) => (
            <motion.div
              key={search.id}
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="w-1 h-10 bg-blue-500 rounded-full"></div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white text-sm">{search.destination}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{search.dates}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{search.travelers} • {search.rooms}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

// =============================================================================
// 2. LAST MINUTE WEEKEND DEALS
// =============================================================================
const weekendDeals = [
  {
    id: 1,
    name: 'Waterfront Suites',
    location: 'Makati City',
    rating: 9.2,
    reviews: 1234,
    originalPrice: 3200,
    salePrice: 2274,
    image: 'https://picsum.photos/seed/waterfront/400/300',
    badge: 'Exceptional',
  },
  {
    id: 2,
    name: 'Ramada by Wyndham Manila Central',
    location: 'Binondo',
    rating: 8.4,
    reviews: 856,
    originalPrice: 5000,
    salePrice: 4400,
    image: 'https://picsum.photos/seed/ramada/400/300',
    badge: 'Very good',
  },
  {
    id: 3,
    name: 'Savoy Hotel Mactan Newtown',
    location: 'Cebu',
    rating: 8.8,
    reviews: 2100,
    originalPrice: 6200,
    salePrice: 5049,
    image: 'https://picsum.photos/seed/savoy/400/300',
    badge: 'Excellent',
  },
  {
    id: 4,
    name: 'The Alpha Suites',
    location: 'BGC Taguig',
    rating: 9.0,
    reviews: 1540,
    originalPrice: 7500,
    salePrice: 5872,
    image: 'https://picsum.photos/seed/alpha/400/300',
    badge: 'Exceptional',
  },
];

export const LastMinuteWeekendDeals = () => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -340 : 340,
        behavior: 'smooth'
      });
    }
  };

  return (
    <section className="w-full py-12">
      <div className="max-w-[1400px] mx-auto px-6">
        <div className="flex items-end justify-between mb-6">
          <div>
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white"
            >
              Last-minute weekend deals
            </motion.h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Exclusive savings on stays near you
            </p>
          </div>
          
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => scroll('left')}
              className="p-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronLeft size={20} className="text-slate-600 dark:text-slate-300" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="p-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronRight size={20} className="text-slate-600 dark:text-slate-300" />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {weekendDeals.map((deal, i) => (
            <motion.div
              key={deal.id}
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="flex-shrink-0 w-[280px] bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-lg transition-shadow cursor-pointer group"
            >
              <div className="relative h-40 overflow-hidden">
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                  style={{ backgroundImage: `url(${deal.image})` }}
                />
                <div className="absolute top-3 left-3 px-2 py-0.5 bg-green-600 text-white text-xs font-medium rounded">
                  {deal.badge}
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-slate-900 dark:text-white truncate">{deal.name}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{deal.location}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-1.5 py-0.5 bg-blue-600 text-white text-xs font-bold rounded">{deal.rating}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">({deal.reviews.toLocaleString()} reviews)</span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-sm text-slate-400 line-through">₱{deal.originalPrice.toLocaleString()}</span>
                  <span className="text-lg font-bold text-slate-900 dark:text-white">₱{deal.salePrice.toLocaleString()}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        
        <button className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 rounded-full hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
          See all deals
        </button>
      </div>
    </section>
  );
};

// =============================================================================
// 3. STAYS FOR EVERY TRAVEL STYLE
// =============================================================================
const travelStyles = [
  { id: 1, title: 'Beach', location: 'Palawan, Philippines', price: 3749, image: 'https://picsum.photos/seed/beach2/400/300' },
  { id: 2, title: 'Kid-friendly', location: 'Tagaytay, Philippines', price: 11681, image: 'https://picsum.photos/seed/kids/400/300' },
  { id: 3, title: 'Staycation', location: 'Manila, Philippines', price: 18261, image: 'https://picsum.photos/seed/staycation/400/300' },
  { id: 4, title: 'Lux Hotels', location: 'Cebu, Philippines', price: 51709, image: 'https://picsum.photos/seed/luxury/400/300' },
];

const styleTabs = ['Beach', 'Kid-Friendly', 'Ski', 'Romantic', 'Wellness and Relaxation'];

export const StaysForEveryStyle = () => {
  const [activeTab, setActiveTab] = React.useState('Beach');

  return (
    <section className="w-full py-12">
      <div className="max-w-[1400px] mx-auto px-6">
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white mb-2"
        >
          Stays for every travel style
        </motion.h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
          Getaways at any destination ~ any time
        </p>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-6 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
          {styleTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {travelStyles.map((style, i) => (
            <motion.div
              key={style.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group cursor-pointer"
            >
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-3">
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                  style={{ backgroundImage: `url(${style.image})` }}
                />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white">{style.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{style.location}</p>
              <p className="text-sm font-medium text-slate-900 dark:text-white mt-1">₱{style.price.toLocaleString()}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

// =============================================================================
// 4. EXPLORE VACATION PACKAGES
// =============================================================================
const packageTabs = ['All Places', 'Ho Chi Minh City', 'Bali', 'Seoul', 'Bangkok'];

const packages = [
  {
    id: 1,
    name: 'The Blossom Resort Vo Coi Da Nang',
    location: 'Da Nang',
    rating: 9.4,
    reviews: 780,
    originalPrice: 25344,
    salePrice: 21369,
    image: 'https://picsum.photos/seed/blossom/400/300',
    includes: ['4★ hotel', 'Free cancellation'],
  },
  {
    id: 2,
    name: 'Golden Lotus Beach Resort',
    location: 'Phu Quoc',
    rating: 8.8,
    reviews: 1250,
    originalPrice: 31469,
    salePrice: 28700,
    image: 'https://picsum.photos/seed/golden/400/300',
    includes: ['5★ hotel', 'Breakfast included'],
  },
  {
    id: 3,
    name: "Mia Mia's Beach Danang",
    location: 'Da Nang',
    rating: 9.0,
    reviews: 920,
    originalPrice: 22200,
    salePrice: 20700,
    image: 'https://picsum.photos/seed/miamia/400/300',
    includes: ['4★ hotel', 'Airport transfer'],
  },
  {
    id: 4,
    name: 'Premium Da Nang Bay',
    location: 'Da Nang',
    rating: 9.2,
    reviews: 650,
    originalPrice: 35000,
    salePrice: 32770,
    image: 'https://picsum.photos/seed/premium/400/300',
    includes: ['5★ hotel', 'Spa access'],
  },
];

export const ExploreVacationPackages = () => {
  const [activeTab, setActiveTab] = React.useState('All Places');

  return (
    <section className="w-full py-12">
      <div className="max-w-[1400px] mx-auto px-6">
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white mb-2"
        >
          Explore vacation packages to popular destinations
        </motion.h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
          <Plane size={14} className="inline mr-1" />
          Flights from Manila · Flight + Hotel bundles unlock savings. 12 free bags per person.
        </p>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-6 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
          {packageTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {packages.map((pkg, i) => (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-lg transition-shadow cursor-pointer group"
            >
              <div className="relative h-40 overflow-hidden">
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                  style={{ backgroundImage: `url(${pkg.image})` }}
                />
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm line-clamp-2">{pkg.name}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                  <MapPin size={12} />
                  {pkg.location}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-1.5 py-0.5 bg-blue-600 text-white text-xs font-bold rounded">{pkg.rating}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">({pkg.reviews} reviews)</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {pkg.includes.map((inc) => (
                    <span key={inc} className="text-xs bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded">
                      {inc}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-xs text-slate-400 line-through">₱{pkg.originalPrice.toLocaleString()}</span>
                  <span className="text-lg font-bold text-slate-900 dark:text-white">₱{pkg.salePrice.toLocaleString()}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <button className="mt-6 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-colors">
          See all packages
        </button>
      </div>
    </section>
  );
};

// =============================================================================
// 5. EXPLORE THESE UNIQUE STAYS
// =============================================================================
const uniqueStays = [
  {
    id: 1,
    name: 'Aircabin + Floats',
    location: 'Calatagan',
    rating: 9.4,
    price: 1825,
    image: 'https://picsum.photos/seed/aircabin/400/300',
    badge: 'Exceptional',
  },
  {
    id: 2,
    name: 'Sunrise Bay Treehouse Cabins',
    location: 'Batangas',
    rating: 8.6,
    price: 1411,
    image: 'https://picsum.photos/seed/treehouse/400/300',
    badge: 'Excellent',
  },
  {
    id: 3,
    name: 'Creekside Bed-rooms',
    location: 'Tanay, Rizal',
    rating: 9.0,
    price: 1623,
    image: 'https://picsum.photos/seed/creekside/400/300',
    badge: 'Very Good',
  },
  {
    id: 4,
    name: 'Ocean Villa',
    location: 'Zambales',
    rating: 9.2,
    price: 1839,
    image: 'https://picsum.photos/seed/oceanvilla/400/300',
    badge: 'Popular',
  },
  {
    id: 5,
    name: 'Cabin by the Lake',
    location: 'Laguna',
    rating: 8.8,
    price: 2150,
    image: 'https://picsum.photos/seed/cabin/400/300',
    badge: 'Trending',
  },
];

const uniqueTabs = ['Tents', 'boats', 'Tree House', 'Resorts'];

export const ExploreUniqueStays = () => {
  const [activeTab, setActiveTab] = React.useState('Tents');

  return (
    <section className="w-full py-12">
      <div className="max-w-[1400px] mx-auto px-6">
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white mb-2"
        >
          Explore these unique stays
        </motion.h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
          <Sparkles size={14} className="inline mr-1" />
          Unique getaways · Tents to Tree Houses & beyond
        </p>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-4 mb-6 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
          {uniqueTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {uniqueStays.map((stay, i) => (
            <motion.div
              key={stay.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="group cursor-pointer"
            >
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-2">
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                  style={{ backgroundImage: `url(${stay.image})` }}
                />
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-blue-600 text-white text-xs font-medium rounded flex items-center gap-1">
                  <Star size={10} fill="currentColor" />
                  {stay.badge}
                </div>
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm truncate">{stay.name}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{stay.location}</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">₱{stay.price.toLocaleString()}<span className="font-normal text-slate-500">/night</span></p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
