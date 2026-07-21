"use client";

import React, { Suspense, useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Moon, Sun, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { useUserCurrency, useUserCountry, useSearchActions } from '@/stores/searchStore';
import { useAuthStore } from '@/stores/authStore';
import SignInDropdown from '../../auth/SignInDropdown';
import CurrencySelector, { CURRENCIES } from '@/components/common/CurrencySelector';
import { cn } from '@/utils/cn';
import { useTranslations, useLocale } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const LOCALE_COUNTRIES: Record<string, string> = {
  en: 'US',
  ko: 'KR',
  cn: 'CN',
  ja: 'JP',
};

const LOCALE_FLAGS: Record<string, string> = {
  en: '🇺🇸',
  ko: '🇰🇷',
  cn: '🇨🇳',
  ja: '🇯🇵',
};

const LOCALE_NAMES: Record<string, string> = {
  en: 'EN',
  ko: '한국어',
  cn: '中文',
  ja: '日本語',
};

const LOCALES = ['en', 'ko', 'cn', 'ja'] as const;
type Locale = (typeof LOCALES)[number];

const LOCALE_COOKIE = 'locale';
const LOCKED_LOCALE = process.env.NEXT_PUBLIC_LOCALE;
const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo';

function getLocaleCookie(): Locale | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : undefined;
  return (LOCALES as readonly string[]).includes(value ?? '') ? (value as Locale) : undefined;
}

function setLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}


const HeaderContent = () => {
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  // Seed from the server-resolved locale (Korean by default, or the visitor's
  // chosen language) so the selector matches the rendered content — no flash.
  const activeLocale = useLocale() as Locale;
  const [locale, setLocale] = useState<Locale>(activeLocale);
  const t = useTranslations('nav');

  useEffect(() => {
    setMounted(true);
    const cookieLocale = getLocaleCookie();
    if (cookieLocale) {
      setLocale(cookieLocale);
    }
  }, []);

  const userCurrency = useUserCurrency();
  const userCountry = useUserCountry();
  const { setUserCurrency, setUserCountry } = useSearchActions();
  const { user } = useAuthStore();

  const handleLocaleSelect = (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
    setLocaleCookie(next);
    router.refresh();
  };

  return (
    <>
      <header suppressHydrationWarning className={cn(
        "sticky top-0 z-60 w-full border-b border-slate-200 dark:border-white/5 bg-white/70 dark:bg-obsidian/70 backdrop-blur-xl transition-colors duration-800 landscape-compact-header",
        // Header is always visible now as per request
        ""
      )}>
        <div suppressHydrationWarning className="max-w-[1400px] mx-auto px-4 sm:px-6 h-11 md:h-14 flex items-center justify-between landscape-compact-header">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0">
            <h1 className="text-base sm:text-lg md:text-xl text-slate-900 dark:text-white font-display font-bold tracking-tight truncate max-w-[120px] sm:max-w-none">
              {BRAND_NAME === 'CheapestGo'
                ? <>Cheapest<span className="text-alabaster-accent dark:text-obsidian-accent">Go</span></>
                : BRAND_NAME === 'GeomeGo'
                ? <>Geo<span className="text-alabaster-accent dark:text-obsidian-accent">Mego</span></>
                : BRAND_NAME}
            </h1>
          </Link>

          {/* Navigation Items (Visible on all screens) */}
          <nav className="flex items-center gap-1 sm:gap-2">
            {/* Language selector — hidden when locale is locked via NEXT_PUBLIC_LOCALE */}
            {!LOCKED_LOCALE && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-1 px-1 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors group cursor-pointer"
                >
                  <span className="text-[9px] text-slate-400 font-bold uppercase">{LOCALE_COUNTRIES[locale]}</span>
                  <span className="text-[11px] font-semibold">{locale.toUpperCase()}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl min-w-[110px] z-[1001]">
                {LOCALES.map((loc) => (
                  <DropdownMenuItem
                    key={loc}
                    onClick={() => handleLocaleSelect(loc)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer",
                      locale === loc
                        ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                        : 'text-slate-700 dark:text-slate-300'
                    )}
                  >
                    <span className="text-[9px] text-slate-400 font-bold w-4">{LOCALE_COUNTRIES[loc]}</span>
                    <span>{LOCALE_NAMES[loc]}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            )}

            {/* Currency selector — hidden when locale is locked (brand has a fixed currency) */}
            {!LOCKED_LOCALE && <CurrencySelector variant="header" className="shrink-0" />}

            {/* Trips */}
            <Link href="/trips" className="flex items-center gap-1 px-2 py-1 text-[10px] sm:text-xs font-normal text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors shrink-0">
              {t('trips')}
            </Link>

            {/* Support (Hidden on very small mobile) */}
            <a href="#" className="hidden xs:flex items-center gap-1 px-2 py-1 text-[10px] sm:text-xs font-normal text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors shrink-0">
              {t('support')}
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

const Header = () => (
  <Suspense fallback={null}>
    <HeaderContent />
  </Suspense>
);

export default Header;
