import { Suspense } from 'react';
import { Header, Footer } from '@/components/landing';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={<div className="h-16 w-full bg-white/70 dark:bg-obsidian/70 backdrop-blur-xl border-b border-slate-200 dark:border-white/5" />}>
        <Header />
      </Suspense>
      {children}
      <Footer />
    </>
  );
}
