"use client";

import React, { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { PlaneTakeoff } from 'lucide-react';

const StandardFooter = () => (
  <footer className="w-full border-t border-slate-200 dark:border-white/5 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md landscape-compact-py">
    <div className="max-w-[1400px] mx-auto px-5 py-3 lg:py-10 landscape:py-2 flex flex-col lg:flex-row justify-between items-start gap-5 lg:gap-8">
      <div className="flex flex-col gap-2 lg:gap-4 w-full lg:w-auto">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-slate-100 dark:bg-white/5 rounded-lg lg:bg-transparent lg:p-0">
            <PlaneTakeoff className="w-4 h-4 lg:w-6 lg:h-6 text-indigo-500 lg:text-slate-400" />
          </div>
          <span className="text-slate-900 dark:text-white font-display font-bold text-[15px] lg:text-xl tracking-tight">CheapestGo</span>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-[10px] lg:text-sm max-w-xs leading-relaxed opacity-80 lg:opacity-100">
          Engineered for the discerning traveler. <br className="hidden lg:block" />Precision data. Zero compromise.
          <br /><span className="text-[9px] lg:text-xs mt-1.5 block font-medium">Powered by Duffel, Mystifly, TravelgateX, ONDA & Rakuten.</span>
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 lg:gap-16 text-[10px] lg:text-sm w-full lg:w-auto">
        <div className="flex flex-col gap-2 lg:gap-4">
          <span className="text-slate-900 dark:text-white font-bold font-display uppercase tracking-wider text-[9px] lg:text-xs">Module</span>
          <div className="flex flex-col gap-1.5 lg:gap-3">
            <a href="#" className="text-slate-500 hover:text-indigo-500 transition-colors">Flights</a>
            <a href="#" className="text-slate-500 hover:text-indigo-500 transition-colors">Hotels</a>
            <a href="#" className="text-slate-500 hover:text-indigo-500 transition-colors">Cars</a>
          </div>
        </div>
        <div className="flex flex-col gap-2 lg:gap-4">
          <span className="text-slate-900 dark:text-white font-bold font-display uppercase tracking-wider text-[9px] lg:text-xs">Company</span>
          <div className="flex flex-col gap-1.5 lg:gap-3">
            <a href="#" className="text-slate-500 hover:text-indigo-500 transition-colors">About Us</a>
            <a href="#" className="text-slate-500 hover:text-indigo-500 transition-colors">Enterprise</a>
            <a href="#" className="text-slate-500 hover:text-indigo-500 transition-colors">Support</a>
          </div>
        </div>
        <div className="flex flex-col gap-2 lg:gap-4 col-span-2 sm:col-span-1">
          <span className="text-slate-900 dark:text-white font-bold font-display uppercase tracking-wider text-[9px] lg:text-xs">Network</span>
          <div className="flex flex-col gap-1.5 lg:gap-3">
            <div className="flex items-center gap-2 text-slate-500 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Flights API
            </div>
            <div className="flex items-center gap-2 text-slate-500 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Payment Gateway
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Legal bottom bar — full width */}
    <div className="border-t border-slate-100 dark:border-white/5 px-5 py-6 lg:py-4 flex flex-col lg:flex-row items-center justify-between gap-4 text-[10px] lg:text-xs text-slate-400 dark:text-slate-500">
      <span className="order-2 lg:order-1 opacity-70">© 2026 JTP Partners. All rights reserved.</span>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 order-1 lg:order-2">
        <a href="/terms-of-service" className="hover:text-indigo-500 transition-colors">Terms</a>
        <a href="/privacy-policy" className="hover:text-indigo-500 transition-colors">Privacy</a>
        <a href="/cookie-policy" className="hover:text-indigo-500 transition-colors">Cookies</a>
        <a href="mailto:support@cheapestgo.com" className="hover:text-indigo-500 transition-colors">Contact</a>
      </div>
    </div>
  </footer>
);

const MinimalFooter = () => (
  <footer className="w-full border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
    <div className="max-w-[1400px] mx-auto px-5 lg:px-6 h-auto py-2.5 lg:h-12 lg:py-0 landscape:py-2 flex flex-col lg:flex-row items-center justify-between gap-3 lg:gap-0 text-[11px] lg:text-xs text-slate-500 dark:text-slate-400">
      <div className="flex items-center gap-6">
        <span className="font-semibold text-slate-700 dark:text-slate-300">CheapestGo © 2026</span>
      </div>

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[9px] lg:text-xs lg:gap-6">
        <a href="/terms-of-service" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors underline-offset-2 hover:underline">Terms & Conditions</a>
        <a href="/privacy-policy" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors underline-offset-2 hover:underline">Privacy Policy</a>
        <a href="/cookie-policy" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors underline-offset-2 hover:underline">Cookie preferences</a>
        <a href="mailto:support@cheapestgo.com" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors underline-offset-2 hover:underline">Contact us</a>
      </div>

      <button className="flex items-center gap-1.5 px-3 py-1 text-[10px] lg:text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
        Report a Bug
      </button>
    </div>
  </footer>
);

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
