import { Suspense } from 'react';
import { CheckoutContent } from '@/components/checkout';

export const dynamic = 'force-dynamic';

export default function CheckoutPage() {
    return (
        <Suspense fallback={<div className="min-h-screen pt-24 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
            <CheckoutContent />
        </Suspense>
    );
}
