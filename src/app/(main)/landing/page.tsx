import FlightSearchForm from "@/components/flights/flightSearchForm";
import { SectionHeader } from "@/components/ui";

/**
 * LandingPage - Server Component for the Flights landing experience.
 * Only contains UI sections and the search form.
 */
export default function LandingPage() {
    return (
        <main className="min-h-screen bg-white">
            {/* Hero Section */}
            <section className="relative h-[600px] flex items-center justify-center bg-slate-900 text-white px-4 overflow-hidden">
                {/* Simplified background for now */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-slate-900 to-black opacity-90" />
                
                <div className="relative max-w-5xl w-full space-y-8 text-center">
                    <div className="space-y-4">
                        <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-tight">
                            Travel Smarter, <br />
                            <span className="text-blue-500 italic">Pay Less.</span>
                        </h1>
                        <p className="text-xl text-slate-300 max-w-2xl mx-auto">
                            The ultimate search engine for global flight deals. We aggregate top providers to find the lowest prices so you don't have to.
                        </p>
                    </div>

                    <div className="w-full max-w-4xl mx-auto pt-4">
                        <FlightSearchForm onSearch={(params) => console.log("Search initiated:", params)} />
                    </div>
                </div>
            </section>

            {/* Marketing Sections */}
            <section className="py-24 px-4 bg-slate-50">
                <div className="max-w-6xl mx-auto space-y-16">
                    <SectionHeader 
                        title="Why Choose CheapestGo?"
                        subtitle="Professional grade flight searching for the savvy traveler."
                        className="flex-col items-center text-center [&>div]:items-center"
                    />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                        <div className="space-y-4">
                            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900">Real-Time Speed</h3>
                            <p className="text-slate-600 leading-relaxed">
                                Our orchestrator queries multiple global providers simultaneously, delivering results in seconds.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900">Best Price Guarantee</h3>
                            <p className="text-slate-600 leading-relaxed">
                                By checking Duffel, Mystifly, and others in one go, we ensure you never miss the lowest fare.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200">
                                <svg className="text-white h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900">Secure Booking</h3>
                            <p className="text-slate-600 leading-relaxed">
                                Direct integration with airline APIs means your booking is secure and confirmed instantly.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 bg-blue-600 text-white">
                <div className="max-w-4xl mx-auto text-center space-y-8 px-4">
                    <h2 className="text-3xl md:text-5xl font-bold">Ready to take off?</h2>
                    <p className="text-blue-100 text-lg">Join thousands of travelers who save every day.</p>
                    <button className="bg-white text-blue-600 px-10 py-4 rounded-full font-bold hover:bg-slate-100 transition-colors shadow-xl">
                        Start Searching Now
                    </button>
                </div>
            </section>
        </main>
    );
}
