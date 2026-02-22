"use client";

import React, { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { PlaneTakeoff } from 'lucide-react';

const StandardFooter = () => (
  <footer className="w-full border-t border-slate-200 dark:border-white/5 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md landscape-compact-py">
    <div className="max-w-[1400px] mx-auto px-5 py-3 lg:py-10 landscape:py-2 flex flex-col lg:flex-row justify-between items-start gap-5 lg:gap-8">
      <div className="flex flex-col gap-1 lg:gap-4">
        <div className="flex items-center gap-1.5">
          <PlaneTakeoff className="w-3.5 h-3.5 lg:w-5 lg:h-5 text-slate-400 dark:text-slate-500" />
          <span className="text-slate-900 dark:text-white font-display font-bold text-[13px] lg:text-lg">CheapestGo</span>
        </div>
        <p className="hidden lg:block text-slate-500 dark:text-slate-400 text-sm max-w-xs leading-relaxed">
          Engineered for the discerning traveler. <br />Precision data. Zero compromise.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6 lg:gap-12 text-[9px] lg:text-sm w-full lg:w-auto landscape:gap-4">
        <div className="flex flex-col gap-1.5 lg:gap-3">
          <span className="text-slate-900 dark:text-white font-semibold font-display">Module</span>
          <a href="#" className="text-slate-500 hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors">Flights</a>
          <a href="#" className="text-slate-500 hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors">Hotels</a>
        </div>
        <div className="flex flex-col gap-1.5 lg:gap-3">
          <span className="text-slate-900 dark:text-white font-semibold font-display">Company</span>
          <a href="#" className="text-slate-500 hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors">About</a>
          <a href="#" className="text-slate-500 hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors">Enterprise</a>
        </div>
        <div className="flex flex-col gap-1.5 lg:gap-3 text-[8px] lg:text-xs">
          <span className="text-slate-900 dark:text-white font-semibold font-display text-[9px] lg:text-sm">Status</span>
          <div className="flex items-center gap-1 text-slate-500 font-mono">
            <span className="w-1 h-1 lg:w-1.5 lg:h-1.5 rounded-full bg-emerald-500 shrink-0"></span> API
          </div>
          <div className="flex items-center gap-1 text-slate-500 font-mono">
            <span className="w-1 h-1 lg:w-1.5 lg:h-1.5 rounded-full bg-emerald-500 shrink-0"></span> Pay
          </div>
        </div>
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
        <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors underline-offset-2 hover:underline">Terms & Conditions</a>
        <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors underline-offset-2 hover:underline">Privacy Policy</a>
        <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors underline-offset-2 hover:underline">Cookie preferences</a>
        <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors underline-offset-2 hover:underline">Contact us</a>
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
  const isMapView = pathname === '/search' && searchParams.get('view') === 'map';

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
