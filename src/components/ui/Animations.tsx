"use client";

import React from 'react';
import { motion } from 'framer-motion';

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}

export const GlowCard: React.FC<GlowCardProps> = ({
  children,
  className = '',
  glowColor = 'rgba(59, 130, 246, 0.5)',
}) => {
  return (
    <motion.div
      className={`relative group ${className}`}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {/* Glow effect */}
      <div
        className="absolute -inset-0.5 rounded-xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500"
        style={{ background: glowColor }}
      />
      {/* Content */}
      <div className="relative">{children}</div>
    </motion.div>
  );
};

// Animated gradient background
interface GradientBackgroundProps {
  children: React.ReactNode;
  className?: string;
}

export const GradientBackground: React.FC<GradientBackgroundProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Animated gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl"
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl"
          animate={{
            x: [0, -30, 0],
            y: [0, -50, 0],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-60 h-60 bg-cyan-500/10 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};

// Floating animation wrapper
interface FloatingProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}

export const Floating: React.FC<FloatingProps> = ({
  children,
  delay = 0,
  duration = 3,
  className = '',
}) => {
  return (
    <motion.div
      className={className}
      animate={{
        y: [0, -10, 0],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      {children}
    </motion.div>
  );
};

// Staggered children animation
interface StaggerContainerProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
}

export const StaggerContainer: React.FC<StaggerContainerProps> = ({
  children,
  className = '',
  staggerDelay = 0.1,
}) => {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={{
        visible: {
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
};

export const StaggerItem: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 30 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
      }}
    >
      {children}
    </motion.div>
  );
};

// Sparkle/Particle effect
interface SparklesProps {
  count?: number;
  className?: string;
}

export const SparkleEffect: React.FC<SparklesProps> = ({ count = 20, className = '' }) => {
  const sparkles = Array.from({ length: count }, (_, i) => ({
    id: i,
    size: Math.random() * 4 + 2,
    left: Math.random() * 100,
    top: Math.random() * 100,
    delay: Math.random() * 3,
    duration: Math.random() * 2 + 2,
  }));

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {sparkles.map((sparkle) => (
        <motion.div
          key={sparkle.id}
          className="absolute rounded-full bg-white"
          style={{
            width: sparkle.size,
            height: sparkle.size,
            left: `${sparkle.left}%`,
            top: `${sparkle.top}%`,
          }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1, 0],
          }}
          transition={{
            duration: sparkle.duration,
            delay: sparkle.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
};

// Parallax scroll effect
interface ParallaxProps {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}

export const Parallax: React.FC<ParallaxProps> = ({
  children,
  speed = 0.5,
  className = '',
}) => {
  return (
    <motion.div
      className={className}
      initial={{ y: 0 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true }}
      style={{ willChange: 'transform' }}
      transition={{ type: 'spring', stiffness: 100 * speed }}
    >
      {children}
    </motion.div>
  );
};

// Shimmer loading effect
export const Shimmer: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <motion.div
        className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/20 to-transparent"
        animate={{ x: ['0%', '200%'] }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
    </div>
  );
};

// Confetti celebration effect
interface ConfettiProps {
  count?: number;
  className?: string;
}

export const Confetti: React.FC<ConfettiProps> = ({ count = 50, className = '' }) => {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];

  const confetti = Array.from({ length: count }, (_, i) => ({
    id: i,
    color: colors[Math.floor(Math.random() * colors.length)],
    left: Math.random() * 100,
    delay: Math.random() * 3,
    duration: Math.random() * 3 + 2,
    size: Math.random() * 10 + 5,
    rotation: Math.random() * 360,
    shape: Math.random() > 0.5 ? 'circle' : 'rect',
  }));

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {confetti.map((piece) => (
        <motion.div
          key={piece.id}
          className="absolute"
          style={{
            left: `${piece.left}%`,
            top: -20,
            width: piece.shape === 'circle' ? piece.size : piece.size * 0.4,
            height: piece.size,
            backgroundColor: piece.color,
            borderRadius: piece.shape === 'circle' ? '50%' : '2px',
          }}
          initial={{ y: -20, rotate: 0, opacity: 1 }}
          animate={{
            y: ['0vh', '100vh'],
            rotate: [0, piece.rotation + 720],
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: piece.duration,
            delay: piece.delay,
            ease: 'linear',
            repeat: Infinity,
          }}
        />
      ))}
    </div>
  );
};

// Balloon celebration effect
interface BalloonsProps {
  count?: number;
  className?: string;
}

export const Balloons: React.FC<BalloonsProps> = ({ count = 8, className = '' }) => {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#F06292', '#64B5F6'];

  const balloons = Array.from({ length: count }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    left: 10 + (i * (80 / count)) + Math.random() * 10,
    delay: i * 0.3,
    duration: 4 + Math.random() * 2,
    size: 40 + Math.random() * 20,
    sway: Math.random() * 30 - 15,
  }));

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {balloons.map((balloon) => (
        <motion.div
          key={balloon.id}
          className="absolute bottom-0"
          style={{ left: `${balloon.left}%` }}
          initial={{ y: '100%', opacity: 0 }}
          animate={{
            y: ['-10%', '-120%'],
            x: [0, balloon.sway, 0, -balloon.sway, 0],
            opacity: [0, 1, 1, 1, 0.8],
          }}
          transition={{
            duration: balloon.duration,
            delay: balloon.delay,
            ease: 'easeOut',
          }}
        >
          {/* Balloon body */}
          <div
            style={{
              width: balloon.size,
              height: balloon.size * 1.2,
              backgroundColor: balloon.color,
              borderRadius: '50% 50% 50% 50% / 40% 40% 60% 60%',
              position: 'relative',
              boxShadow: `inset -${balloon.size * 0.15}px -${balloon.size * 0.1}px ${balloon.size * 0.2}px rgba(0,0,0,0.1), inset ${balloon.size * 0.1}px ${balloon.size * 0.1}px ${balloon.size * 0.3}px rgba(255,255,255,0.3)`,
            }}
          >
            {/* Balloon knot */}
            <div
              style={{
                position: 'absolute',
                bottom: -5,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 8,
                height: 8,
                backgroundColor: balloon.color,
                borderRadius: '50%',
                filter: 'brightness(0.8)',
              }}
            />
            {/* Balloon string */}
            <div
              style={{
                position: 'absolute',
                bottom: -60,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 1,
                height: 60,
                background: `linear-gradient(to bottom, ${balloon.color}, transparent)`,
              }}
            />
          </div>
        </motion.div>
      ))}
    </div>
  );
};

// Celebration wrapper with confetti and balloons
interface CelebrationProps {
  children: React.ReactNode;
  className?: string;
  showConfetti?: boolean;
  showBalloons?: boolean;
}

export const Celebration: React.FC<CelebrationProps> = ({
  children,
  className = '',
  showConfetti = true,
  showBalloons = true,
}) => {
  return (
    <div className={`relative ${className}`}>
      {showConfetti && <Confetti count={60} />}
      {showBalloons && <Balloons count={10} />}
      <div className="relative z-10">{children}</div>
    </div>
  );
};
