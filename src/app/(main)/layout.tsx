import { Header, Footer } from '@/components/landing';
import { VoiceAssistant } from '@/components/voice/VoiceAssistant';

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
    </>
  );
}
