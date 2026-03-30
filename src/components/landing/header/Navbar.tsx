"use client";

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Moon, Sun, Download, Menu, X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import SignInDropdown from '../../auth/SignInDropdown';
import { useUserCurrency, useSearchActions } from '@/stores/searchStore';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import NavLink from './Navlink';
import { usePWAInstall } from '@/contexts/PWAInstallContext';

/** Currency code → flag emoji (primary country for that currency) */
const CURRENCY_FLAGS: Record<string, string> = {
  PHP: '🇵🇭',
  USD: '🇺🇸',
  KRW: '🇰🇷',
};

const CURRENCIES = ['KRW', 'USD', 'PHP'] as const;

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
  const { setUserCurrency } = useSearchActions();
  const { isInstallable, isIOS, isInstalled, triggerInstall } = usePWAInstall();
  const showInstallButton = !isInstalled && (isInstallable || isIOS);

  const currencyFlag = CURRENCY_FLAGS[userCurrency] || '🌐';

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

  const handleCurrencySelect = (currency: string) => {
    setUserCurrency(currency);
    setIsCurrencyOpen(false);
    if (pathname.includes('/property/') || pathname.includes('/search')) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('currency', currency);
      router.replace(`${pathname}?${params.toString()}`);
    }
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
    setIsMobileCurrencyOpen(false);
  };

  return (
    <>
      <header className="fixed top-0 z-50 w-full px-4 pt-3 bg-transparent landscape-compact-header font-nunito">
        <div className="w-full sm:w-[95%] mx-auto p-2 px-4 sm:px-6 h-14 sm:h-20 flex items-center justify-between bg-slate/20 backdrop-blur rounded-full">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <h1 className="text-lg md:text-xl lg:text-2xl text-black dark:text-white font-display font-bold tracking-tight truncate max-w-[140px] sm:max-w-none font-nunito">
              Cheapest<span className="text-alabaster-accent dark:text-obsidian-accent">Go</span>
            </h1>
          </Link>


          {/* NavLinks */}
          <nav className="hidden lg:flex items-center gap-3">
            <NavLink href="#" external>List Your Property</NavLink>
            <NavLink href="#" external>Support</NavLink>
          </nav>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-3">
            {/* Install / Open App Button */}
            {showInstallButton && (
              <button
                onClick={triggerInstall}
                className="flex items-center gap-1.5 px-3 py-1.5 text-lg font-medium text-blue-600 dark:text-blue-400 border border-blue-600 hover:bg-white/5 dark:border-blue-400 rounded-full dark:hover:bg-blue-500/10 transition-colors"
              >
                <Download size={14} />
                Install app
              </button>
            )}

            {/* Currency dropdown */}
            <div className="relative" ref={currencyRef}>
              <button
                onClick={() => setIsCurrencyOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3 py-2 text-lg font-medium text-blue-600 dark:text-slate-300 hover:bg-white/5 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                aria-expanded={isCurrencyOpen}
                aria-haspopup="listbox"
                aria-label="Select currency"
              >
                <span className="text-base">{currencyFlag}</span>
                {userCurrency}
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
                    className="absolute right-0 top-full mt-1 min-w-[120px] py-1 rounded-lg dark:border-white/10 bg-white/20 backdrop-blur dark:bg-slate-900 shadow-lg z-50 cursor-pointer"
                  >
                    {CURRENCIES.map((currency) => (
                      <li key={currency} role="option" aria-selected={userCurrency === currency}>
                        <button
                          type="button"
                          onClick={() => handleCurrencySelect(currency)}
                          className={`flex items-center gap-2 w-full px-3 py-2 text-left text-sm font-medium transition-colors ${userCurrency === currency
                            ? ' dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                        >
                          <span className="text-base">{CURRENCY_FLAGS[currency]}</span>
                          {currency}
                        </button>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-white/5 dark:hover:bg-white/10 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5 text-white" /> : <Moon className="w-5 h-5 text-blue-500" />}
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

      {/* Mobile Navigation Drawer*/}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop — separate fixed element, no parent transform context */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-60 bg-black/50 lg:hidden"
              onClick={closeMenu}
              onTouchMove={(e) => e.preventDefault()}
            />

            {/* Drawer Panel — fixed directly to viewport, never inside a transformed parent */}
            <motion.nav
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-dvh w-[280px] z-61 bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden lg:hidden"
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
              <div className="flex-1 overflow-y-auto py-2 min-h-0" data-scrollable>
                {showInstallButton && (
                  <button
                    onClick={() => { triggerInstall(); closeMenu(); }}
                    className="flex items-center gap-3 px-4 min-h-[40px] w-full text-left text-[13px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                  >
                    <Download size={16} />
                    Install app
                  </button>
                )}

                {/* Currency — dropdown in hamburger menu */}
                <div className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => setIsMobileCurrencyOpen((o) => !o)}
                    className="flex items-center justify-between w-full min-h-[40px] px-3.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800/50 text-left text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base">{currencyFlag}</span>
                      {userCurrency}
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
                        <div className="mt-1 flex flex-col rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden">
                          {CURRENCIES.map((currency) => (
                            <button
                              key={currency}
                              type="button"
                              onClick={() => { handleCurrencySelect(currency); closeMenu(); }}
                              className={`flex items-center gap-3 px-3.5 min-h-[38px] w-full text-left text-[13px] font-medium transition-colors ${userCurrency === currency
                                ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                            >
                              <span className="text-base">{CURRENCY_FLAGS[currency]}</span>
                              {currency}
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

              {/* Drawer Footer — Sign In / Account */}
              <div className="p-4 border-t border-slate-200 dark:border-white/10 shrink-0">
                <SignInDropdown variant="inline" onNavigate={closeMenu} />
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Header;
