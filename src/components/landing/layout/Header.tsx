"use client";

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Moon, Sun, Download, Menu, X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import SignInDropdown from '../../auth/SignInDropdown';
import { useUserCurrency, useUserCountry, useSearchActions } from '@/stores/searchStore';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

/** Country code → currency label mapping */
const COUNTRY_CURRENCY: Record<string, { currency: string; countryName: string; flag: string }> = {
  PH: { currency: 'PHP', countryName: 'Philippines', flag: '🇵🇭' },
  US: { currency: 'USD', countryName: 'United States', flag: '🇺🇸' },
  KR: { currency: 'KRW', countryName: 'South Korea', flag: '🇰🇷' },
};

const CURRENCIES = [
  { code: 'KRW', country: 'KR' },
  { code: 'USD', country: 'US' },
  { code: 'PHP', country: 'PH' },
] as const;

const Header = () => {
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [isMobileCurrencyOpen, setIsMobileCurrencyOpen] = useState(false);
  const currencyRef = useRef<HTMLDivElement>(null);

  const userCurrency = useUserCurrency();
  const userCountry = useUserCountry();
  const { setUserCurrency, setUserCountry } = useSearchActions();

  const selectedCountry = COUNTRY_CURRENCY[userCountry] || COUNTRY_CURRENCY['PH'];

  useBodyScrollLock(isMenuOpen);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (currencyRef.current && !currencyRef.current.contains(e.target as Node)) {
        setIsCurrencyOpen(false);
      }
    };
    if (isCurrencyOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCurrencyOpen]);

  const handleCurrencySelect = (currencyCode: string, countryCode: string) => {
    setUserCurrency(currencyCode);
    setUserCountry(countryCode);
    setIsCurrencyOpen(false);
    setIsMobileCurrencyOpen(false);

    if (pathname && (pathname.includes('/property/') || pathname.includes('/search') || pathname.includes('/flights'))) {
      const params = new URLSearchParams(searchParams?.toString() || '');
      params.set('currency', currencyCode);
      // For properties, it might need re-fetching, so replace URL to trigger server components
      router.replace(`${pathname}?${params.toString()}`);
    }
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
    setIsMobileCurrencyOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-white/5 bg-white/70 dark:bg-obsidian/70 backdrop-blur-xl transition-colors duration-800 landscape-compact-header">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between landscape-compact-header">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <h1 className="text-lg md:text-xl lg:text-2xl text-slate-900 dark:text-white font-display font-bold tracking-tight truncate max-w-[140px] sm:max-w-none">
              Cheapest<span className="text-alabaster-accent dark:text-obsidian-accent">Go</span>
            </h1>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-3">
            {/* Open App Button */}
            <a href="#" className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 rounded-full hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
              <Download size={14} />
              Open app
            </a>

            {/* Currency dropdown */}
            <div className="relative" ref={currencyRef}>
              <button
                onClick={() => setIsCurrencyOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
                aria-expanded={isCurrencyOpen}
                aria-haspopup="listbox"
                aria-label="Select currency"
              >
                <span className="text-xs text-slate-400 font-bold uppercase">{userCountry}</span>
                <span className="text-sm font-bold">{userCurrency}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isCurrencyOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {isCurrencyOpen && (
                  <motion.ul
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    role="listbox"
                    className="absolute right-0 top-full mt-1 min-w-[140px] py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-2xl z-50 overflow-hidden"
                  >
                    {CURRENCIES.map((c) => (
                      <li key={c.code} role="option" aria-selected={userCurrency === c.code}>
                        <button
                          type="button"
                          onClick={() => handleCurrencySelect(c.code, c.country)}
                          className={`flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm font-medium transition-colors ${userCurrency === c.code
                            ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                        >
                          <span className="text-xs text-slate-400 font-bold w-5">{c.country}</span>
                          <span className="font-bold">{c.code}</span>
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>

            {/* List your property */}
            <a href="#" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">
              List Your Property
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
            <div className="hidden lg:block">
              <SignInDropdown />
            </div>
          </nav>

          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setIsMenuOpen(true)}
            className="lg:hidden flex items-center justify-center min-h-[44px] min-w-[44px] p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6 text-slate-700 dark:text-white" />
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer — rendered outside <header> so fixed positioning covers the full viewport */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] lg:hidden"
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
              <div className="flex items-center justify-between p-3.5 border-b border-slate-200 dark:border-white/10">
                <span className="font-display font-bold text-sm text-slate-900 dark:text-white">Menu</span>
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
                  className="flex items-center gap-3 px-4 min-h-[40px] text-[13px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                >
                  <Download size={16} />
                  Open app
                </a>

                {/* Currency — dropdown in hamburger menu */}
                <div className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => setIsMobileCurrencyOpen((o) => !o)}
                    className="flex items-center justify-between w-full min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50 text-left text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">{userCountry}</span>
                      <span className="font-bold">{userCurrency}</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isMobileCurrencyOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {isMobileCurrencyOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 flex flex-col rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
                          {CURRENCIES.map((c) => (
                            <button
                              key={c.code}
                              type="button"
                              onClick={() => { handleCurrencySelect(c.code, c.country); }}
                              className={`flex items-center gap-3 px-4 min-h-[44px] w-full text-left text-[13px] font-medium transition-colors ${userCurrency === c.code
                                ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                            >
                              <span className="text-[10px] text-slate-400 font-bold w-6">{c.country}</span>
                              <span className="font-bold">{c.code}</span>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="my-1 mx-4 border-t border-slate-200 dark:border-white/10" />

                <a
                  href="#"
                  className="flex items-center gap-3 px-4 min-h-[44px] text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  List your property
                </a>

                <a
                  href="#"
                  className="flex items-center gap-3 px-4 min-h-[44px] text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  Support
                </a>

                <Link
                  href="/trips"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-4 min-h-[44px] text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  Trips
                </Link>

                <div className="my-1 mx-4 border-t border-slate-200 dark:border-white/10" />

                <button
                  onClick={() => { toggleTheme(); }}
                  className="flex items-center gap-3 px-4 min-h-[44px] w-full text-left text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
              </div>

              {/* Drawer Footer — Sign In / Account dropdown */}
              <div className="p-4 border-t border-slate-200 dark:border-white/10">
                <SignInDropdown variant="inline" collapsible onNavigate={closeMenu} />
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence >
    </>
  );
};

export default Header;
