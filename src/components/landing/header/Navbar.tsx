"use client";

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Moon, Sun, Download, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import SignInDropdown from '../../auth/SignInDropdown';
import { useUserCurrency, useSearchActions } from '@/stores/searchStore';
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
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const currencyRef = useRef<HTMLDivElement>(null);

  const userCurrency = useUserCurrency();
  const { setUserCurrency } = useSearchActions();
  const { isInstallable, isIOS, isInstalled, triggerInstall } = usePWAInstall();
  const showInstallButton = !isInstalled && (isInstallable || isIOS);

  const currencyFlag = CURRENCY_FLAGS[userCurrency] || '🌐';


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


  return (
    <>
      <header className="fixed top-0 z-50 w-full px-4 pt-1.5 bg-transparent landscape-compact-header font-nunito">
        <div className="w-full sm:w-[95%] mx-auto p-1 px-4 sm:px-6 h-11 md:h-16 flex items-center justify-between bg-slate/20 backdrop-blur rounded-full">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0">
            <h1 className="text-base sm:text-lg md:text-xl text-black dark:text-white font-display font-bold tracking-tight truncate max-w-[120px] sm:max-w-none font-nunito">
              Cheapest<span className="text-alabaster-accent dark:text-obsidian-accent">Go</span>
            </h1>
          </Link>


          {/* Navigation Items (Visible on all screens) */}
          <nav className="flex items-center gap-1 sm:gap-2">
            {/* NavLinks (Hidden on very small mobile) */}
            <div className="hidden xs:flex items-center gap-2">
              <NavLink href="#" className="text-[10px] sm:text-xs">Support</NavLink>
            </div>

            {/* Install / Open App Button (Compact on mobile) */}
            {showInstallButton && (
              <button
                onClick={triggerInstall}
                className="flex items-center gap-1 px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs font-normal text-blue-600 dark:text-blue-400 border border-blue-600/20 dark:border-blue-400/20 rounded-full hover:bg-white/5 dark:border-blue-400/20 dark:hover:bg-blue-500/10 transition-colors shrink-0"
              >
                <Download size={12} />
                <span className="hidden sm:inline">Open app</span>
              </button>
            )}

            {/* Currency dropdown */}
            <div className="relative shrink-0" ref={currencyRef}>
              <button
                onClick={() => setIsCurrencyOpen((o) => !o)}
                className="flex items-center gap-1 px-1.5 py-1 text-[10px] sm:text-xs font-normal text-blue-600 dark:text-slate-300 hover:bg-white/5 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                aria-expanded={isCurrencyOpen}
                aria-haspopup="listbox"
                aria-label="Select currency"
              >
                <span className="text-sm">{currencyFlag}</span>
                <span className="hidden xs:inline">{userCurrency}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isCurrencyOpen ? 'rotate-180' : ''}`} />
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
                          className={`flex items-center gap-2 w-full px-3 py-2 text-left text-xs font-normal transition-colors ${userCurrency === currency
                            ? ' dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5'
                            }`}
                        >
                          <span className="text-sm">{CURRENCY_FLAGS[currency]}</span>
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
              className="p-1 sm:p-1.5 rounded-lg hover:bg-white/5 dark:hover:bg-white/10 transition-colors shrink-0"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" /> : <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />}
            </button>

            {/* Sign in Dropdown (Desktop only) */}
            <div className="hidden lg:block shrink-0">
              <SignInDropdown />
            </div>
          </nav>
        </div>
      </header>

    </>
  );
};

export default Header;
