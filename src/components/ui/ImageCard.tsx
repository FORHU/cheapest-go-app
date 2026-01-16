"use client";

import React from 'react';
import { motion } from 'framer-motion';

interface ImageCardProps {
  image: string;
  title: string;
  aspectRatio?: 'square' | '3/2' | '4/3' | '16/9';
  overlay?: boolean;
  badge?: React.ReactNode;
  index?: number;
  onClick?: () => void;
  className?: string;
}

export const ImageCard: React.FC<ImageCardProps> = ({
  image,
  title,
  aspectRatio = '4/3',
  overlay = true,
  badge,
  index = 0,
  onClick,
  className = '',
}) => {
  const aspectClasses = {
    'square': 'aspect-square',
    '3/2': 'aspect-3/2',
    '4/3': 'aspect-4/3',
    '16/9': 'aspect-video',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className={`group cursor-pointer ${className}`}
    >
      <div className={`relative ${aspectClasses[aspectRatio]} rounded-xl overflow-hidden mb-2`}>
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
          style={{ backgroundImage: `url(${image})` }}
        />
        {overlay && (
          <div className="absolute inset-0 bg-linear-to-t from-black/50 to-transparent" />
        )}
        {badge && (
          <div className="absolute top-2 left-2">
            {badge}
          </div>
        )}
        <span className="absolute bottom-3 left-3 text-white font-semibold text-sm">
          {title}
        </span>
      </div>
    </motion.div>
  );
};
