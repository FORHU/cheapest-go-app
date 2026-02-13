import React from 'react';
import { PlaneTakeoff } from 'lucide-react';

const Footer = () => (
  <footer className="w-full border-t border-slate-200 dark:border-white/5 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
    <div className="max-w-[1400px] mx-auto px-6 py-12 flex flex-col md:flex-row justify-between items-start gap-8">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <PlaneTakeoff className="text-slate-400 dark:text-slate-500" />
          <span className="text-slate-900 dark:text-white font-display font-bold text-lg">CheapestGo</span>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs leading-relaxed">
          Engineered for the discerning traveler. <br/>Precision data. Zero compromise.
        </p>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-12 text-sm">
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

export default Footer;
