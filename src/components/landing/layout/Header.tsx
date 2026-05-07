"use client";

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Moon, Sun, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { useUserCurrency, useUserCountry, useSearchActions } from '@/stores/searchStore';
import { usePWAInstall } from '@/contexts/PWAInstallContext';
import { useAuthStore } from '@/stores/authStore';
import SignInDropdown from '../../auth/SignInDropdown';
import CurrencySelector, { CURRENCIES } from '@/components/common/CurrencySelector';
import { cn } from '@/utils/cn';


const Header = () => {
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const userCurrency = useUserCurrency();
  const userCountry = useUserCountry();
  const { setUserCurrency, setUserCountry } = useSearchActions();
  const { user } = useAuthStore();

  const { triggerInstall } = usePWAInstall();

  return (
    <>
      <header suppressHydrationWarning className={cn(
        "sticky top-0 z-[60] w-full border-b border-slate-200 dark:border-white/5 bg-white/70 dark:bg-obsidian/70 backdrop-blur-xl transition-colors duration-800 landscape-compact-header",
        // Header is always visible now as per request
        ""
      )}>
        <div suppressHydrationWarning className="max-w-[1400px] mx-auto px-4 sm:px-6 h-11 md:h-14 flex items-center justify-between landscape-compact-header">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0">
            <h1 className="text-base sm:text-lg md:text-xl text-slate-900 dark:text-white font-display font-bold tracking-tight truncate max-w-[120px] sm:max-w-none">
              Cheapest<span className="text-alabaster-accent dark:text-obsidian-accent">Go</span>
            </h1>
          </Link>

          {/* Navigation Items (Visible on all screens) */}
          <nav className="flex items-center gap-1 sm:gap-2">
            {/* Open App Button (Compact on mobile) */}
            <button onClick={triggerInstall} className="flex items-center gap-1 px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs font-normal text-blue-600 dark:text-blue-400 border border-blue-600/20 dark:border-blue-400/20 rounded-full hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors shrink-0">
              <Download size={12} />
              <span className="hidden sm:inline">Open app</span>
            </button>

            {/* Currency selector */}
            <CurrencySelector variant="header" className="shrink-0" />

            {/* Support (Hidden on very small mobile) */}
            <a href="#" className="hidden xs:flex items-center gap-1 px-2 py-1 text-[10px] sm:text-xs font-normal text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors shrink-0">
              Support
            </a>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-1 sm:p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
            >
              {mounted && (theme === 'dark' ? <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" /> : <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-700" />)}
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
