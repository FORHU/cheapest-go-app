import React from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale, getTranslations } from 'next-intl/server';
import Script from 'next/script';
import './globals.css';
import { ThemeProvider } from '@/components/context/ThemeContext';
import { QueryProvider } from '@/providers/QueryProvider';
import { AuthListener } from '@/components/auth/AuthListener';
import { ExchangeRateListener } from '@/components/exchange/ExchangeRateListener';
import { GlobalSparkle } from '@/components/ui/GlobalSparkle';
import AuthModal from '@/components/auth/AuthModal';
import { PWAInstallProvider } from '@/contexts/PWAInstallContext';
import InstallPWAPrompt from '@/components/pwa/InstallPWAPrompt';
import PWAServiceWorkerRegistrar from '@/components/pwa/PWAServiceWorkerRegistrar';
import { env } from '@/utils/env';
import { hreflangAlternates } from '@/lib/seo/hreflang';
import { ClientOnly } from '@/components/common/ClientOnly';
import { MobileBottomNav } from '@/components/common/MobileBottomNav';
import { ScrollToTop } from '@/components/common/ScrollToTop';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const interTight = Inter_Tight({ subsets: ['latin'], variable: '--font-display' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'optional' });

const SITE_URL = env.SITE_URL;
const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'CheapestGo';
const BRAND_FAVICON = process.env.NEXT_PUBLIC_BRAND_FAVICON ?? '/Fav_Icon_Light.png';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seo');
  const tagline = t('siteTagline');
  const description = t('siteDescription', { brand: BRAND_NAME });
  const title = `${BRAND_NAME} | ${tagline}`;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: hreflangAlternates('/'),
    icons: {
      icon: BRAND_FAVICON,
      apple: BRAND_FAVICON,
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: BRAND_NAME,
    },
    openGraph: {
      title,
      description,
      url: SITE_URL,
      siteName: BRAND_NAME,
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION && {
      verification: {
        google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
      },
    }),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      {/* {process.env.NODE_ENV === 'development' && (
        <Script src="https://cdn.jsdelivr.net/npm/react-scan/dist/auto.global.js" />
      )} */}
      <body className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable} font-sans`} suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <QueryProvider>
            <ThemeProvider>
              <PWAInstallProvider>
                <AuthListener />
                <ExchangeRateListener />
                <PWAServiceWorkerRegistrar />
                <div className="relative min-h-screen w-full bg-alabaster dark:bg-obsidian text-slate-900 dark:text-white transition-colors duration-800 bg-grid-alabaster dark:bg-grid-obsidian bg-size-40px_40px" suppressHydrationWarning>
                  <GlobalSparkle />
                  <div className="relative flex flex-col flex-1 pb-24 lg:pb-0" suppressHydrationWarning>
                    {children}
                  </div>
                  <ScrollToTop />
                  {/* ClientOnly prevents MobileBottomNav from SSR-ing.
                      It uses usePathname() + Framer Motion layoutId which
                      produce different HTML on server vs client, causing
                      the bis_skin_checked hydration mismatch. */}
                  <ClientOnly>
                    <MobileBottomNav />
                  </ClientOnly>
                </div>
                <AuthModal />
                <InstallPWAPrompt />
              </PWAInstallProvider>
            </ThemeProvider>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
