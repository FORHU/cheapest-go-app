import { Header, Footer } from '@/components/landing';
import { VoiceAssistant } from '@/components/voice/VoiceAssistant';
import { TermsGate } from '@/components/legal/TermsGate';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="pb-16 lg:pb-0">
        {children}
      </main>
      <Footer />
      <VoiceAssistant />
      <TermsGate />
    </>
  );
}
