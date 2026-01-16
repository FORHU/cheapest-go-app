"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Star } from 'lucide-react';

interface PropertyCardProps {
  image: string;
  name: string;
  location: string;
  rating?: number;
  reviews?: number;
  originalPrice?: number;
  price: number;
  badge?: string;
  badgeColor?: 'green' | 'blue';
  includes?: string[];
  priceLabel?: string;
  index?: number;
  onClick?: () => void;
  className?: string;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({
  image,
  name,
  location,
  rating,
  reviews,
  originalPrice,
  price,
  badge,
  badgeColor = 'green',
  includes,
  priceLabel,
  index = 0,
  onClick,
  className = '',
}) => {
  const badgeClasses = {
    green: 'bg-gradient-to-r from-green-500 to-emerald-600',
    blue: 'bg-gradient-to-r from-blue-500 to-cyan-600',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false }}
      transition={{ 
        delay: index * 0.1,
        type: 'spring',
        stiffness: 100,
        damping: 15
      }}
      whileHover={{ y: -8, scale: 1.02 }}
      onClick={onClick}
      className={`relative group ${className}`}
    >
      {/* Glow effect on hover */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 rounded-xl opacity-0 group-hover:opacity-75 blur-xl transition-all duration-500 group-hover:duration-200" />
      
      {/* Card content */}
      <div className="relative bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50 shadow-lg dark:shadow-black/20 cursor-pointer backdrop-blur-sm">
        <div className="relative h-40 overflow-hidden">
          <motion.div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${image})` }}
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.6 }}
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          
          {badge && (
            <motion.div 
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: index * 0.1 + 0.3 }}
              className={`absolute top-3 left-3 px-3 py-1 ${badgeClasses[badgeColor]} text-white text-xs font-medium rounded-full flex items-center gap-1 shadow-lg`}
            >
              {badgeColor === 'blue' && <Star size={10} fill="currentColor" />}
              {badge}
            </motion.div>
          )}
        </div>
        
        <div className="p-4">
          <h3 className="font-semibold text-slate-900 dark:text-white text-sm line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {name}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
            <MapPin size={12} className="text-blue-500" />
            {location}
          </p>
          {rating && (
            <div className="flex items-center gap-2 mt-2">
              <span className="px-2 py-0.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs font-bold rounded-md shadow-sm">
                {rating}
              </span>
              {reviews && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  ({reviews.toLocaleString()} reviews)
                </span>
              )}
            </div>
          )}
          {includes && includes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {includes.map((inc) => (
                <span 
                  key={inc} 
                  className="text-xs bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800"
                >
                  {inc}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-baseline gap-2">
            {originalPrice && (
              <span className="text-xs text-slate-400 line-through">
                ₱{originalPrice.toLocaleString()}
              </span>
            )}
            <span className="text-lg font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              ₱{price.toLocaleString()}
              {priceLabel && (
                <span className="font-normal text-slate-500 text-sm bg-none text-slate-500">
                  {priceLabel}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
