"use client";

import React from 'react';
import { PlaneTakeoff, Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeContext';
import { StatusBadge } from './Components';

const Header = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-white/5 bg-white/70 dark:bg-obsidian/70 backdrop-blur-xl transition-colors duration-800">
      <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-8 flex items-center justify-center bg-slate-900 dark:bg-white/5 rounded-md shadow-sm border border-transparent dark:border-white/10">
            <PlaneTakeoff className="text-white dark:text-obsidian-accent w-5 h-5" />
          </div>
          <h1 className="text-slate-900 dark:text-white font-display font-bold text-xl tracking-tight">
            AeroVantage<span className="text-alabaster-accent dark:text-obsidian-accent">.Pro</span>
          </h1>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {['Flights', 'Stays', 'Charters'].map((item) => (
            <a key={item} href="#" className="px-4 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-all duration-200">
              {item}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden sm:block">
            <StatusBadge />
          </div>
          <button 
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-white" /> : <Moon className="w-5 h-5 text-slate-700" />}
          </button>
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 border border-black/5 dark:border-white/10" />
        </div>
      </div>
    </header>
  );
};

export default Header;
