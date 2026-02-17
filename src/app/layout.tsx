import React from 'react';
import type { Metadata } from 'next';
import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/context/ThemeContext';
import { QueryProvider } from '@/providers/QueryProvider';
import { AuthListener } from '@/components/auth/AuthListener';
import AuthModal from '@/components/auth/AuthModal';
import { GlobalSparkle } from '@/components/ui/GlobalSparkle';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const interTight = Inter_Tight({ subsets: ['latin'], variable: '--font-display' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'CheapestGo',
  description: 'CheapestGo is a travel booking platform that helps you find the best deals on flights and hotels',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable} font-sans`}>
        <QueryProvider>
          <ThemeProvider>
            <AuthListener />
            <div className="relative min-h-screen w-full bg-alabaster dark:bg-obsidian text-slate-900 dark:text-white transition-colors duration-800 bg-grid-alabaster dark:bg-grid-obsidian bg-[length:40px_40px]">
              <GlobalSparkle />
              {children}
            </div>
            <AuthModal />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
