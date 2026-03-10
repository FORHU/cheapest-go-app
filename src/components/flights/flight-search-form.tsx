import { Input, Button } from "@/components/ui";
import { CabinClass, FlightSearchParams } from "@/types/flights";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface FlightSearchFormProps {
    onSearch?: (params: FlightSearchParams) => void;
    isLoading?: boolean;
}

/**
 * FlightSearchForm - Pure UI component for capturing flight search parameters.
 * No business logic or API calls happen here.
 */
export default function FlightSearchForm({ onSearch, isLoading }: FlightSearchFormProps) {
    const router = useRouter();
    const [params, setParams] = useState<FlightSearchParams>({
        origin: "",
        destination: "",
        departureDate: "",
        returnDate: "",
        adults: 1,
        children: 0,
        infants: 0,
        cabinClass: "economy",
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // 1. Call onSearch if provided (for logging/analytics)
        onSearch?.(params);

        // 2. Build Query String
        const searchParams = new URLSearchParams({
            origin: params.origin,
            destination: params.destination,
            departure: params.departureDate,
            adults: params.adults.toString(),
            children: params.children.toString(),
            infants: params.infants.toString(),
            cabin: params.cabinClass,
        });

        if (params.returnDate) {
            searchParams.append("return", params.returnDate);
        }

        // 3. Redirect to results page
        router.push(`/flights/search?${searchParams.toString()}`);
    };

    return (
        <form onSubmit={handleSubmit} className="p-6 bg-white rounded-xl shadow-lg space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Origin</label>
                    <Input 
                        placeholder="ICN (Seoul)" 
                        value={params.origin}
                        onChange={(e) => setParams({ ...params, origin: e.target.value })}
                        required
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Destination</label>
                    <Input 
                        placeholder="NRT (Tokyo)" 
                        value={params.destination}
                        onChange={(e) => setParams({ ...params, destination: e.target.value })}
                        required
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Departure</label>
                    <Input 
                        type="date" 
                        value={params.departureDate}
                        onChange={(e) => setParams({ ...params, departureDate: e.target.value })}
                        required
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Return (Optional)</label>
                    <Input 
                        type="date" 
                        value={params.returnDate}
                        onChange={(e) => setParams({ ...params, returnDate: e.target.value })}
                    />
                </div>
            </div>

            <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Adults</label>
                    <Input 
                        type="number" 
                        min={1} 
                        className="w-20"
                        value={params.adults}
                        onChange={(e) => setParams({ ...params, adults: parseInt(e.target.value) || 1 })}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Children</label>
                    <Input 
                        type="number" 
                        min={0} 
                        className="w-20"
                        value={params.children}
                        onChange={(e) => setParams({ ...params, children: parseInt(e.target.value) || 0 })}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Infants</label>
                    <Input 
                        type="number" 
                        min={0} 
                        className="w-20"
                        value={params.infants}
                        onChange={(e) => setParams({ ...params, infants: parseInt(e.target.value) || 0 })}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Cabin</label>
                    <select 
                        className="h-10 px-3 rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={params.cabinClass}
                        onChange={(e) => setParams({ ...params, cabinClass: e.target.value as CabinClass })}
                    >
                        <option value="economy">Economy</option>
                        <option value="premium_economy">Premium Economy</option>
                        <option value="business">Business</option>
                        <option value="first">First</option>
                    </select>
                </div>
                <div className="flex-1 flex justify-end">
                    <Button type="submit" disabled={isLoading} className="px-8">
                        {isLoading ? "Searching..." : "Search Flights"}
                    </Button>
                </div>
            </div>
        </form>
    );
}
