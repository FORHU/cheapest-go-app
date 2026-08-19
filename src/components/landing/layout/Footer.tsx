"use client";

import React, { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo';
const BRAND_EMAIL = process.env.NEXT_PUBLIC_BRAND_EMAIL ?? 'support@cheapestgo.com';

const StandardFooter = () => {
  const t = useTranslations('footer');
  return (
    <footer className="w-full border-t border-slate-200 dark:border-white/5 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md landscape-compact-py">
      <div className="max-w-[1400px] mx-auto px-5 py-3 lg:py-10 landscape:py-2 flex flex-col lg:flex-row justify-between items-start gap-5 lg:gap-8">
        <div className="flex flex-col gap-2 lg:gap-4 w-full lg:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-slate-900 dark:text-white font-display font-bold text-[15px] lg:text-xl tracking-tight">{BRAND_NAME}</span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-[10px] lg:text-sm max-w-xs leading-relaxed opacity-80 lg:opacity-100">
            {t('tagline')} <br className="hidden lg:block" />{t('taglinePrecision')}
            <br /><span className="text-[9px] lg:text-xs mt-1.5 block font-medium">{t('poweredBy')}</span>
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 lg:gap-16 text-[10px] lg:text-sm w-full lg:w-auto">
          <div className="flex flex-col gap-2 lg:gap-4">
            <span className="text-slate-900 dark:text-white font-bold font-display uppercase tracking-wider text-[9px] lg:text-xs">{t('module')}</span>
            <div className="flex flex-col gap-1.5 lg:gap-3">
              <a href="/?mode=flights" className="text-slate-500 hover:text-indigo-500 transition-colors">{t('flights')}</a>
              <a href="/?mode=hotels" className="text-slate-500 hover:text-indigo-500 transition-colors">{t('hotels')}</a>
              <a href="#" className="text-slate-500 hover:text-indigo-500 transition-colors">{t('cars')}</a>
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:gap-4">
            <span className="text-slate-900 dark:text-white font-bold font-display uppercase tracking-wider text-[9px] lg:text-xs">{t('company')}</span>
            <div className="flex flex-col gap-1.5 lg:gap-3">
              <a href="/about" className="text-slate-500 hover:text-indigo-500 transition-colors">{t('aboutUs')}</a>
              <a href={`mailto:${BRAND_EMAIL}`} className="text-slate-500 hover:text-indigo-500 transition-colors">{t('enterprise')}</a>
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:gap-4">
            <span className="text-slate-900 dark:text-white font-bold font-display uppercase tracking-wider text-[9px] lg:text-xs">{t('network')}</span>
            <div className="flex flex-col gap-1.5 lg:gap-3">
              <div className="flex items-center gap-2 text-slate-500 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> {t('flightsApi')}
              </div>
              <div className="flex items-center gap-2 text-slate-500 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> {t('paymentGateway')}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:gap-4">
            <span className="text-slate-900 dark:text-white font-bold font-display uppercase tracking-wider text-[9px] lg:text-xs">{t('legal')}</span>
            <div className="flex flex-col gap-1.5 lg:gap-3">
              <a href="/terms-of-service" className="text-slate-500 hover:text-indigo-500 transition-colors">{t('terms')}</a>
              <a href="/privacy-policy" className="text-slate-500 hover:text-indigo-500 transition-colors">{t('privacy')}</a>
              <a href="/cookie-policy" className="text-slate-500 hover:text-indigo-500 transition-colors">{t('cookies')}</a>
              <a href={`mailto:${BRAND_EMAIL}`} className="text-slate-500 hover:text-indigo-500 transition-colors">{t('contact')}</a>
            </div>
          </div>
        </div>
      </div>

      {/* Legal bottom bar — links now live in the Legal column above */}
      <div className="border-t border-slate-100 dark:border-white/5 px-5 py-6 lg:py-4 flex items-center justify-center lg:justify-start text-[10px] lg:text-xs text-slate-400 dark:text-slate-500">
        <span className="opacity-70">&copy; 2026 FORHU Inc. {t('allRightsReserved')}</span>
      </div>
    </footer>
  );
};

const MinimalFooter = () => {
  const t = useTranslations('footer');
  return (
    <footer className="w-full border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
      <div className="max-w-[1400px] mx-auto px-5 lg:px-6 h-auto py-2.5 lg:h-12 lg:py-0 landscape:py-2 flex flex-col lg:flex-row items-center justify-between gap-3 lg:gap-0 text-[11px] lg:text-xs text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-6">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">&copy; 2026 {BRAND_NAME}. {t('allRightsReserved')}</span>
                        </div>

        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[9px] lg:text-xs lg:gap-6">
          <a href="/terms-of-service" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors underline-offset-2 hover:underline">{t('termsMinimal')}</a>
          <a href="/privacy-policy" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors underline-offset-2 hover:underline">{t('privacyMinimal')}</a>
          <a href="/cookie-policy" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors underline-offset-2 hover:underline">{t('cookiesMinimal')}</a>
          <a href={`mailto:${BRAND_EMAIL}`} className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors underline-offset-2 hover:underline">{t('contactMinimal')}</a>
        </div>

        <button className="flex items-center gap-1.5 px-3 py-1 text-[10px] lg:text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          {t('reportBug')}
        </button>
      </div>
    </footer>
  );
};

const FooterContent = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMapView = pathname === '/search' && searchParams?.get('view') === 'map';

  if (isMapView) return null; // Hide completely in map view to maximize screen space
  return <StandardFooter />;
};

const Footer = () => {
  return (
    <Suspense fallback={<StandardFooter />}>
      <FooterContent />
    </Suspense>
  );
};

export default Footer;
