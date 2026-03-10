import FlightSearchForm from "@/components/flights/flightSearchForm";
import { FlightSearchParams } from "@/types/flights";

export default function FlightsPage() {
    return (
        <main className="min-h-screen bg-gray-50 flex flex-col items-center py-20 px-4">
            <div className="max-w-6xl w-full space-y-8">
                <div className="text-center space-y-4">
                    <h1 className="text-4xl md:text-6xl font-extrabold text-gray-900 tracking-tight">
                        Find the <span className="text-blue-600">Cheapest</span> Flights
                    </h1>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                        Search across the best providers including Duffel and Mystifly to get real-time availability and prices.
                    </p>
                </div>

                <div className="w-full">
                    {/* 
                        In a real scenario, onSearch would call a Server Action or an API route.
                        For Phase 2, we just render the form.
                    */}
                    <FlightSearchForm onSearch={(params: FlightSearchParams) => console.log("Search initiated:", params)} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12">
                    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-2">
                        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center font-bold">1</div>
                        <h3 className="font-bold text-gray-900">Enter Details</h3>
                        <p className="text-sm text-gray-500">Pick your origin, destination, and dates.</p>
                    </div>
                    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-2">
                        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center font-bold">2</div>
                        <h3 className="font-bold text-gray-900">Compare Prices</h3>
                        <p className="text-sm text-gray-500">We search multiple providers in real-time.</p>
                    </div>
                    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-2">
                        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center font-bold">3</div>
                        <h3 className="font-bold text-gray-900">Book Instantly</h3>
                        <p className="text-sm text-gray-500">Secure your seat without leaving the platform.</p>
                    </div>
                </div>
            </div>
        </main>
    );
}
