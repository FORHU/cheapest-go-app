"use client";

import React, { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { PlaneTakeoff } from 'lucide-react';

const StandardFooter = () => (
  <footer className="w-full border-t border-slate-200 dark:border-white/5 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col md:flex-row justify-between items-start gap-8">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <PlaneTakeoff className="text-slate-400 dark:text-slate-500" />
          <span className="text-slate-900 dark:text-white font-display font-bold text-lg">CheapestGo</span>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs leading-relaxed">
          Engineered for the discerning traveler. <br />Precision data. Zero compromise.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 sm:gap-12 text-sm">
        <div className="flex flex-col gap-3">
          <span className="text-slate-900 dark:text-white font-semibold font-display">Module</span>
          <a href="#" className="text-slate-500 hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors">Flights</a>
          <a href="#" className="text-slate-500 hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors">Hotels</a>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-slate-900 dark:text-white font-semibold font-display">Company</span>
          <a href="#" className="text-slate-500 hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors">About</a>
          <a href="#" className="text-slate-500 hover:text-alabaster-accent dark:hover:text-obsidian-accent transition-colors">Enterprise</a>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-slate-900 dark:text-white font-semibold font-display">Status</span>
          <div className="flex items-center gap-2 text-slate-500 font-mono text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> API: Online
          </div>
          <div className="flex items-center gap-2 text-slate-500 font-mono text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Payments: Online
          </div>
        </div>
      </div>
    </div>
  </footer>
);

const MinimalFooter = () => (
  <footer className="w-full border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-auto py-3 sm:h-12 sm:py-0 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-0 text-xs text-slate-500 dark:text-slate-400">
      <div className="flex items-center gap-6">
        <span className="font-semibold text-slate-700 dark:text-slate-300">CheapestGo © 2026</span>
      </div>

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[10px] sm:text-xs md:gap-6">
        <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">Terms & Conditions</a>
        <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">Privacy Policy</a>
        <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">Cookie preferences</a>
        <a href="#" className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">Contact us</a>
      </div>

      <button className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
        Report a Bug
      </button>
    </div>
  </footer>
);

const FooterContent = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMapView = pathname === '/search' && searchParams.get('view') === 'map';

  if (isMapView) return <MinimalFooter />;
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
