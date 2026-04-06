import { LegalLayout } from '@/components/landing/layout/LegalLayout';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy — CheapestGo',
  description: 'Understand how cancellations, refunds, and amendments work on CheapestGo.',
};

export default function RefundPolicyPage() {
  return (
    <LegalLayout
      title="Refund & Cancellation Policy"
      subtitle="Everything you need to know about cancellations, refunds, and booking changes."
      effectiveDate="May 1, 2025"
      lastUpdated="April 1, 2025"
      sections={[
        {
          title: 'Overview',
          content: (
            <p>
              CheapestGo acts as an intermediary between you and travel suppliers (hotels, airlines,
              and package providers). Cancellation and refund rights are primarily governed by the
              individual supplier's policies, which vary by property, rate type, and booking dates.
              This policy explains how we facilitate cancellations and refunds on your behalf.
            </p>
          ),
        },
        {
          title: 'Hotel Cancellation Types',
          content: (
            <>
              <p>When you book a hotel through CheapestGo, you will see one of the following rate types:</p>
              <div className="space-y-3 mt-2">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <p className="font-semibold text-green-800 dark:text-green-300 mb-1">Free Cancellation</p>
                  <p className="text-slate-600 dark:text-slate-300">
                    You may cancel at no charge before the deadline specified at booking. The exact
                    deadline (e.g., "Free cancellation until 48 hours before check-in") is shown on
                    the booking page and in your confirmation email.
                  </p>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <p className="font-semibold text-yellow-800 dark:text-yellow-300 mb-1">Partially Refundable</p>
                  <p className="text-slate-600 dark:text-slate-300">
                    A partial refund applies depending on when you cancel relative to the check-in
                    date. The penalty amount and cutoff dates are displayed before you confirm payment.
                  </p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <p className="font-semibold text-red-800 dark:text-red-300 mb-1">Non-Refundable</p>
                  <p className="text-slate-600 dark:text-slate-300">
                    No refund is provided if you cancel. These rates are typically lower in price
                    and are clearly labeled "Non-refundable" before checkout.
                  </p>
                </div>
              </div>
            </>
          ),
        },
        {
          title: 'How to Cancel a Booking',
          content: (
            <>
              <p>To cancel a booking:</p>
              <ol className="list-decimal pl-5 space-y-1.5">
                <li>Log in to your CheapestGo account and go to <strong>My Bookings</strong>.</li>
                <li>Select the booking you wish to cancel and click <strong>Cancel Booking</strong>.</li>
                <li>Review the cancellation policy and any applicable fees shown on screen.</li>
                <li>Confirm the cancellation. You will receive a cancellation confirmation email.</li>
              </ol>
              <p>
                Alternatively, contact us at{' '}
                <a href="mailto:support@cheapestgo.com" className="text-blue-600 dark:text-blue-400 hover:underline">
                  support@cheapestgo.com
                </a>{' '}
                with your booking reference number and we will process the cancellation within 1
                business day.
              </p>
            </>
          ),
        },
        {
          title: 'Refund Processing',
          content: (
            <>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  <strong>Eligible refunds</strong> are processed back to the original payment method
                  (credit/debit card or GrabPay) used at checkout via Stripe.
                </li>
                <li>
                  <strong>Processing time:</strong> Once we initiate the refund, it typically takes
                  5–10 business days to appear on your statement, depending on your bank or card issuer.
                </li>
                <li>
                  <strong>CheapestGo service fee:</strong> Our platform service markup (currently 12%)
                  is non-refundable unless the cancellation is due to a supplier error or CheapestGo
                  system fault.
                </li>
                <li>
                  <strong>Stripe processing fees:</strong> Payment processing fees charged by Stripe
                  are non-refundable by CheapestGo, in line with Stripe's standard policy.
                </li>
                <li>
                  <strong>Currency:</strong> Refunds are issued in the same currency as the original
                  payment. Exchange rate differences at the time of refund are not our responsibility.
                </li>
              </ul>
            </>
          ),
        },
        {
          title: 'No-Shows',
          content: (
            <p>
              If you fail to check in on the scheduled arrival date without cancelling in advance,
              the booking will be treated as a no-show. No-show policies vary by hotel — most hotels
              will charge the full booking amount. CheapestGo cannot override hotel no-show policies.
              We strongly recommend cancelling ahead of time if your plans change.
            </p>
          ),
        },
        {
          title: 'Booking Amendments',
          content: (
            <>
              <p>
                Date changes, room type changes, and guest name corrections are subject to hotel
                availability and supplier policies. To request an amendment:
              </p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Contact us at support@cheapestgo.com with your booking reference</li>
                <li>Specify the change you need and the reason</li>
                <li>We will check availability with the supplier and confirm if the amendment is possible</li>
              </ol>
              <p>
                <strong>Note:</strong> Amendments may result in a price difference (additional charge
                or credit) and may not always be possible without cancelling and rebooking. We cannot
                guarantee that amendment requests will be accommodated.
              </p>
            </>
          ),
        },
        {
          title: 'Supplier Cancellations and Force Majeure',
          content: (
            <>
              <p>
                In rare cases, a hotel or travel supplier may cancel your booking due to overbooking,
                closure, natural disaster, or force majeure events. If this occurs:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>CheapestGo will notify you as soon as we are informed by the supplier</li>
                <li>We will process a full refund of the amount paid to CheapestGo, including our service fee</li>
                <li>We will assist you in finding alternative accommodation where possible, though we cannot guarantee a replacement</li>
              </ul>
              <p>
                CheapestGo is not liable for losses arising from supplier cancellations, including
                transportation costs, additional hotel nights booked elsewhere, or consequential losses.
                We recommend purchasing travel insurance to cover such events.
              </p>
            </>
          ),
        },
        {
          title: 'Disputes and Chargebacks',
          content: (
            <p>
              If you have a concern about a charge, please contact us at support@cheapestgo.com
              before initiating a chargeback with your bank. Most issues can be resolved quickly.
              Chargebacks initiated without first contacting CheapestGo may result in account
              suspension. CheapestGo reserves the right to contest chargebacks that are made in bad
              faith or that do not comply with our cancellation policy.
            </p>
          ),
        },
        {
          title: 'Flight Packages',
          content: (
            <p>
              For all-inclusive flight + hotel packages, cancellation terms depend on both the hotel
              and airline components. Airline tickets are generally non-refundable or carry significant
              cancellation fees. The specific terms for your package will be shown during checkout and
              in your confirmation email. If you need to cancel a package, contact us immediately at
              support@cheapestgo.com for guidance.
            </p>
          ),
        },
        {
          title: 'Contact for Refund Requests',
          content: (
            <>
              <p>
                For all refund and cancellation queries, please have your booking reference number
                ready and reach us at:
              </p>
              <ul className="list-none space-y-1">
                <li>📧 support@cheapestgo.com</li>
                <li>🏢 JTP Partners · 30 Wall Street, 8th Floor · New York, NY 10005 · USA</li>
              </ul>
              <p>We aim to respond to all refund requests within 1–2 business days.</p>
            </>
          ),
        },
      ]}
    />
  );
}
