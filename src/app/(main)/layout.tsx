import { Header, Footer } from '@/components/landing';
import { VoiceAssistant } from '@/components/voice/VoiceAssistant';
import { SearchNavigationOverlay } from '@/components/search/SearchNavigationOverlay';
import { SupportWidget } from '@/components/support/SupportWidget';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main>
        {children}
      </main>
      <Footer />
      <VoiceAssistant />
      <SearchNavigationOverlay />
      <SupportWidget />
    </>
  );
}
