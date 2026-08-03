import { Header, Footer } from '@/components/landing';
import { VoiceAssistant } from '@/components/voice/VoiceAssistant';
import { SearchNavigationOverlay } from '@/components/search/SearchNavigationOverlay';

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
    </>
  );
}
