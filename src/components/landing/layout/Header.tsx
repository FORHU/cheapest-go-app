"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { PlaneTakeoff, Moon, Sun, Download, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import SignInDropdown from '../../auth/SignInDropdown';
import { useUserCurrency, useUserCountry, useSearchActions } from '@/stores/searchStore';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

/** Country code → flag emoji */
const COUNTRY_FLAGS: Record<string, string> = {
  'PH': '🇵🇭', 'KR': '🇰🇷', 'JP': '🇯🇵', 'US': '🇺🇸', 'SG': '🇸🇬',
  'MY': '🇲🇾', 'TH': '🇹🇭', 'VN': '🇻🇳', 'ID': '🇮🇩', 'AU': '🇦🇺',
  'GB': '🇬🇧', 'FR': '🇫🇷', 'DE': '🇩🇪', 'CN': '🇨🇳', 'TW': '🇹🇼',
  'HK': '🇭🇰', 'IN': '🇮🇳', 'AE': '🇦🇪', 'CA': '🇨🇦',
};

const Header = () => {
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const userCurrency = useUserCurrency();
  const userCountry = useUserCountry();
  const { setUserCurrency } = useSearchActions();

  const flag = COUNTRY_FLAGS[userCountry] || '🌐';

  useBodyScrollLock(isMenuOpen);

  const handleCurrencyChange = () => {
    const nextCurrency = userCurrency === 'PHP' ? 'USD' : userCurrency === 'USD' ? 'KRW' : 'PHP';
    setUserCurrency(nextCurrency);

    // Update URL if we are on a property page or search page
    if (pathname.includes('/property/') || pathname.includes('/search')) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('currency', nextCurrency);
      router.replace(`${pathname}?${params.toString()}`);
    }
  };

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-white/5 bg-white/70 dark:bg-obsidian/70 backdrop-blur-xl transition-colors duration-800">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="size-8 flex items-center justify-center bg-slate-900 dark:bg-white/5 rounded-md shadow-sm border border-transparent dark:border-white/10">
            <PlaneTakeoff className="text-white dark:text-obsidian-accent w-5 h-5" />
          </div>
          <h1 className="text-slate-900 dark:text-white font-display font-bold text-xl tracking-tight">
            Cheapest<span className="text-alabaster-accent dark:text-obsidian-accent">Go</span>
          </h1>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-3">
          {/* Open App Button */}
          <a href="#" className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 rounded-full hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
            <Download size={14} />
            Open app
          </a>

          {/* Currency/Region */}
          <button
            onClick={handleCurrencyChange}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            <span className="text-base">{flag}</span>
            {userCurrency}
          </button>

          {/* List your property */}
          <a href="#" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">
            List your property
          </a>

          {/* Support */}
          <a href="#" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">
            Support
          </a>

          {/* Trips */}
          <Link href="/trips" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">
            Trips
          </Link>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-white" /> : <Moon className="w-5 h-5 text-slate-700" />}
          </button>

          {/* Sign in Dropdown */}
          <SignInDropdown />
        </nav>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setIsMenuOpen(true)}
          className="md:hidden flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6 text-slate-700 dark:text-white" />
        </button>
      </div>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] md:hidden"
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" onClick={closeMenu} />

            {/* Drawer Panel */}
            <motion.nav
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="absolute right-0 top-0 h-full w-[280px] bg-white dark:bg-slate-900 shadow-2xl flex flex-col"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-white/10">
                <span className="font-display font-bold text-slate-900 dark:text-white">Menu</span>
                <button
                  onClick={closeMenu}
                  className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5 text-slate-700 dark:text-white" />
                </button>
              </div>

              {/* Drawer Links */}
              <div className="flex-1 overflow-y-auto py-2">
                <a
                  href="#"
                  className="flex items-center gap-3 px-4 min-h-[48px] text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                >
                  <Download size={18} />
                  Open app
                </a>

                <button
                  onClick={() => { handleCurrencyChange(); closeMenu(); }}
                  className="flex items-center gap-3 px-4 min-h-[48px] w-full text-left text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <span className="text-lg">{flag}</span>
                  Currency: {userCurrency}
                </button>

                <div className="my-1 mx-4 border-t border-slate-200 dark:border-white/10" />

                <a
                  href="#"
                  className="flex items-center gap-3 px-4 min-h-[48px] text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  List your property
                </a>

                <a
                  href="#"
                  className="flex items-center gap-3 px-4 min-h-[48px] text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  Support
                </a>

                <Link
                  href="/trips"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-4 min-h-[48px] text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  Trips
                </Link>

                <div className="my-1 mx-4 border-t border-slate-200 dark:border-white/10" />

                <button
                  onClick={() => { toggleTheme(); }}
                  className="flex items-center gap-3 px-4 min-h-[48px] w-full text-left text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
              </div>

              {/* Drawer Footer — Sign In */}
              <div className="p-4 border-t border-slate-200 dark:border-white/10">
                <SignInDropdown />
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
