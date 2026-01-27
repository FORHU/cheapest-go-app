
import { searchLiteApi } from "@/utils/supabase/functions";

export default async function TestSearchPage() {
    const params = {
        checkin: "2026-06-01",
        checkout: "2026-06-05",
        adults: 2,
        children: 0,
        guest_nationality: "KR",
        currency: "USD",
        cityName: "Baguio", // Testing Baguio explicity
        query: "Baguio",
    };

    let result = null;
    let error = null;

    try {
        result = await searchLiteApi(params);
    } catch (e: any) {
        error = e.message;
    }

    const firstHotel = result?.data?.[0];

    return (
        <div className="p-8 font-sans">
            <h1 className="text-2xl font-bold mb-4">Supabase Edge Function Test</h1>

            <div className="mb-4">
                <h2 className="text-xl font-semibold">Function: liteapi-search</h2>
                <p className="text-gray-600">Testing "Baguio" Search</p>
            </div>

            {error ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
                    <h3 className="font-bold">Error:</h3>
                    <p>{error}</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* HOTEL IDENTITY CHECK */}
                    <div className="p-6 bg-blue-50 border border-blue-200 rounded-xl">
                        <h3 className="font-bold text-lg text-blue-900 mb-4">1. Hotel Identity Verification</h3>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded shadow-sm border border-blue-100">
                                <span className="block text-xs uppercase text-gray-400 font-bold mb-1">Hotel Name (Should be 'The Manor' etc)</span>
                                <span className="text-xl font-bold text-blue-700">
                                    {firstHotel?.name || "❌ MISSING NAME"}
                                </span>
                            </div>

                            <div className="bg-white p-4 rounded shadow-sm border border-blue-100">
                                <span className="block text-xs uppercase text-gray-400 font-bold mb-1">Hotel ID</span>
                                <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                                    {firstHotel?.hotelId || "N/A"}
                                </code>
                            </div>
                        </div>

                        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
                            <strong>Status:</strong> {firstHotel?.details ? "✅ Details Merged" : "❌ Details Missing (Merge Failed)"}
                        </div>
                    </div>

                    {/* ROOM DATA CHECK */}
                    <div className="p-6 bg-gray-50 border border-gray-200 rounded-xl opacity-75">
                        <h3 className="font-bold text-lg text-gray-700 mb-4">2. Room Data (Ignore for Hotel Name)</h3>
                        <div className="bg-white p-4 rounded shadow-sm">
                            <span className="block text-xs uppercase text-gray-400 font-bold mb-1">Room Name</span>
                            <span className="text-md font-mono text-gray-600">
                                {firstHotel?.roomTypes?.[0]?.rates?.[0]?.name || "N/A"}
                            </span>
                        </div>
                    </div>

                    {/* RAW DATA */}
                    <div className="border rounded p-4 bg-gray-900 text-gray-300 overflow-auto max-h-[500px]">
                        <h4 className="font-bold text-sm mb-2 text-white">Raw JSON Response:</h4>
                        <pre className="text-xs">{JSON.stringify(result, null, 2)}</pre>
                    </div>
                </div>
            )}
        </div>
    );
}
