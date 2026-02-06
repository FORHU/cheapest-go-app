import { getCurrentUser } from '@/app/actions';
import CheckoutPageContent from './CheckoutPageContent';

/**
 * Checkout Page - SERVER COMPONENT
 * Fetches auth state server-side and passes to client form.
 * Checkout allows unauthenticated browsing (soft protection) -
 * users can view pricing before signing in to complete booking.
 */
export default async function CheckoutPage() {
    const user = await getCurrentUser();

    return <CheckoutPageContent serverUser={user} />;
}
