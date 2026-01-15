import React from 'react';
import type { Metadata } from 'next';
import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeContext';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const interTight = Inter_Tight({ subsets: ['latin'], variable: '--font-display' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'AeroVantage Pro',
  description: 'Elite protocol for global mobility.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable} font-sans`}>
        <ThemeProvider>
          <div className="min-h-screen w-full bg-alabaster dark:bg-obsidian text-slate-900 dark:text-white transition-colors duration-800 bg-grid-alabaster dark:bg-grid-obsidian bg-[length:40px_40px]">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
