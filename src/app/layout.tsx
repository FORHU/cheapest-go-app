import React from 'react';
import type { Metadata } from 'next';
import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { ThemeProvider } from '@/components/context/ThemeContext';
import { QueryProvider } from '@/providers/QueryProvider';
import { AuthListener } from '@/components/auth/AuthListener';
import { ExchangeRateListener } from '@/components/exchange/ExchangeRateListener';
import { GlobalSparkle } from '@/components/ui/GlobalSparkle';
import AuthModalWrapper from '@/components/auth/AuthModalWrapper';
import { env } from '@/utils/env';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const interTight = Inter_Tight({ subsets: ['latin'], variable: '--font-display' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'optional' });

const SITE_URL = env.SITE_URL;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'CheapestGo | Discover and Book Your Next Global Journey',
  description: 'Discover the best travel deals globally. Plan your flights and hotels easily, save money, and start exploring the world with CheapestGo - your modern travel OS.',
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
  openGraph: {
    title: 'CheapestGo | Discover and Book Your Next Global Journey',
    description: 'Discover the best travel deals globally. Plan your flights and hotels easily, save money, and start exploring the world with CheapestGo - your modern travel OS.',
    url: SITE_URL,
    siteName: 'CheapestGo',
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: 'CheapestGo - Ultimate Travel Booking Platform',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CheapestGo | Discover and Book Your Next Global Journey',
    description: 'Discover the best travel deals globally. Plan your flights and hotels easily, save money, and start exploring the world with CheapestGo - your modern travel OS.',
    images: [`${SITE_URL}/og-image.png`],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      {process.env.NODE_ENV === 'development' && (
        <Script src="https://cdn.jsdelivr.net/npm/react-scan/dist/auto.global.js" />
      )}
      <body className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable} font-sans`}>
        <QueryProvider>
          <ThemeProvider>
            <AuthListener />
            <ExchangeRateListener />
            <div className="relative min-h-screen w-full bg-alabaster dark:bg-obsidian text-slate-900 dark:text-white transition-colors duration-800 bg-grid-alabaster dark:bg-grid-obsidian bg-[length:40px_40px]">
              <GlobalSparkle />
              {children}
            </div>
            <AuthModalWrapper />
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
