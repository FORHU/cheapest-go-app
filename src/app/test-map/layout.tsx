import { redirect } from 'next/navigation';

export default function TestMapLayout({ children }: { children: React.ReactNode }) {
    if (process.env.NODE_ENV !== 'development') redirect('/');
    return <>{children}</>;
}
