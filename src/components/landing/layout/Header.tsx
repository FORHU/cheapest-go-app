"use client";

import React from 'react';
import Link from 'next/link';
import { PlaneTakeoff, Moon, Sun, Download } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import SignInDropdown from '../../auth/SignInDropdown';

const Header = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-white/5 bg-white/70 dark:bg-obsidian/70 backdrop-blur-xl transition-colors duration-800">
      <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="size-8 flex items-center justify-center bg-slate-900 dark:bg-white/5 rounded-md shadow-sm border border-transparent dark:border-white/10">
            <PlaneTakeoff className="text-white dark:text-obsidian-accent w-5 h-5" />
          </div>
          <h1 className="text-slate-900 dark:text-white font-display font-bold text-xl tracking-tight">
            AeroVantage<span className="text-alabaster-accent dark:text-obsidian-accent">.Pro</span>
          </h1>
        </Link>

        {/* Right Side Navigation */}
        <nav className="hidden md:flex items-center gap-3">
          {/* Open App Button */}
          <a href="#" className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-600 dark:border-blue-400 rounded-full hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors">
            <Download size={14} />
            Open app
          </a>

          {/* Currency/Region */}
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">
            <span className="text-base">🇵🇭</span>
            PHP
          </button>

          {/* List your property */}
          <a href="#" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">
            List your property
          </a>

          {/* Support */}
          <a href="#" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">
            Support
          </a>

          {/* Trips */}
          <a href="#" className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">
            Trips
          </a>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-white" /> : <Moon className="w-5 h-5 text-slate-700" />}
          </button>

          {/* Sign in Dropdown */}
          <SignInDropdown />
        </nav>
      </div>
    </header>
  );
};

export default Header;
