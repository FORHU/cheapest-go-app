"use client";

import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { BaseProps } from '../types';

interface MagneticButtonProps extends BaseProps {
  onClick?: () => void;
}

export const MagneticButton: React.FC<MagneticButtonProps> = ({ onClick, className }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const { clientX, clientY } = e;
    const { left, top, width, height } = ref.current?.getBoundingClientRect() || { left: 0, top: 0, width: 0, height: 0 };
    
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    
    const distanceX = clientX - centerX;
    const distanceY = clientY - centerY;

    // Only apply effect if within 60px range (approximate check via bounds)
    // We dampen the movement by dividing by 4 to make it subtle (max ~15px shift)
    setPosition({ x: distanceX / 4, y: distanceY / 4 });
  };

  const handleMouseLeave = () => {
    setPosition({ x: 0, y: 0 });
  };

  return (
    <motion.button
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      animate={{ x: position.x, y: position.y }}
      transition={{ type: "spring", stiffness: 150, damping: 15, mass: 0.1 }}
      className={`
        relative group flex items-center justify-center gap-2 px-8 py-4 rounded-lg
        font-display font-bold text-sm tracking-wide transition-all duration-300
        dark:bg-obsidian-accent dark:text-obsidian dark:hover:bg-cyan-300 dark:shadow-[0_0_20px_rgba(34,211,238,0.4)]
        bg-alabaster-accent text-white hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.3)]
        ${className}
      `}
    >
      <span>Search</span>
      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
    </motion.button>
  );
};