"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

interface PWAInstallContextValue {
  /** Chrome/Edge/Android — native install available */
  isInstallable: boolean;
  /** iOS Safari — must use manual Add to Home Screen flow */
  isIOS: boolean;
  /** Already running as installed PWA */
  isInstalled: boolean;
  /** Show the install banner */
  showBanner: boolean;
  /** iOS step-by-step guide modal is open */
  isGuideOpen: boolean;
  triggerInstall: () => Promise<void>;
  openGuide: () => void;
  closeGuide: () => void;
  /** Dismiss banner for 7 days */
  dismiss: () => void;
}

const PWAInstallContext = createContext<PWAInstallContextValue>({
  isInstallable: false,
  isIOS: false,
  isInstalled: false,
  showBanner: false,
  isGuideOpen: false,
  triggerInstall: async () => {},
  openGuide: () => {},
  closeGuide: () => {},
  dismiss: () => {},
});

const DISMISSED_KEY = 'cgo_pwa_dismissed_until';
const BANNER_DELAY_MS = 4000;

export function PWAInstallProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  useEffect(() => {
    // Already running as installed PWA — don't show anything
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    if (standalone) {
      setIsInstalled(true);
      return;
    }

    // Dismissed recently — respect the user's choice
    const dismissedUntil = localStorage.getItem(DISMISSED_KEY);
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) return;

    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    // Show the banner after a delay for ALL browsers (we handle each case on click).
    // beforeinstallprompt fires asynchronously (requires active SW on Chrome),
    // so we don't wait for it — we show the banner and upgrade the button if it arrives.
    const t = setTimeout(() => setShowBanner(true), BANNER_DELAY_MS);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
      // Banner might already be showing — this just upgrades the install button
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setShowBanner(false);
      setDeferredPrompt(null);
      setIsInstallable(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      clearTimeout(t);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (isIOS) {
      setIsGuideOpen(true);
      return;
    }
    if (deferredPrompt) {
      // Chrome / Edge / Android — native install prompt
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setShowBanner(false);
      }
      setDeferredPrompt(null);
      setIsInstallable(false);
      return;
    }
    // Fallback (Firefox, Safari desktop, Chrome before SW is active) —
    // show the manual guide so the user isn't left with a dead button
    setIsGuideOpen(true);
  }, [deferredPrompt, isIOS]);

  const openGuide = useCallback(() => setIsGuideOpen(true), []);
  const closeGuide = useCallback(() => setIsGuideOpen(false), []);

  const dismiss = useCallback(() => {
    setShowBanner(false);
    localStorage.setItem(DISMISSED_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  }, []);

  return (
    <PWAInstallContext.Provider
      value={{
        isInstallable,
        isIOS,
        isInstalled,
        showBanner,
        isGuideOpen,
        triggerInstall,
        openGuide,
        closeGuide,
        dismiss,
      }}
    >
      {children}
    </PWAInstallContext.Provider>
  );
}

export const usePWAInstall = () => useContext(PWAInstallContext);
