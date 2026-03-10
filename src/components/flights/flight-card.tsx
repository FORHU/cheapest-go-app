import { FlightResultCache } from "@/types/flights";
import { Button } from "@/components/ui";

interface FlightCardProps {
    flight: FlightResultCache & { isSuperCheap?: boolean; isAlmostSoldOut?: boolean };
}

/**
 * FlightCard - Premium display for a single flight offer.
 */
export default function FlightCard({ flight }: FlightCardProps) {
    const formattedPrice = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: flight.currency,
    }).format(flight.price);

    // Format times
    const formatTime = (isoString: string) => {
        return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (isoString: string) => {
        return new Date(isoString).toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const durationHours = Math.floor(flight.duration / 60);
    const durationMinutes = flight.duration % 60;

    return (
        <div className="relative bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-center gap-6 hover:shadow-md transition-shadow">
            {/* Airline Info */}
            <div className="flex md:flex-col items-center md:items-start gap-4 md:w-40 border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 md:pr-4 w-full">
                <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center font-black text-blue-600 text-lg shadow-inner">
                    {flight.airline.substring(0, 2).toUpperCase()}
                </div>
                <div className="text-left">
                    <h4 className="font-bold text-slate-900 truncate max-w-[120px]">{flight.airline}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{flight.provider}</p>
                </div>
            </div>

            {/* Marketing Tags */}
            <div className="absolute -top-3 left-6 flex gap-2">
                {flight.isSuperCheap && (
                    <div className="bg-orange-500 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg shadow-orange-200 uppercase tracking-tighter flex items-center gap-1">
                        <span>🔥</span> Super Cheap
                    </div>
                )}
                {flight.isAlmostSoldOut && (
                    <div className="bg-red-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg shadow-red-200 uppercase tracking-tighter flex items-center gap-1">
                        <span>⚠️</span> {flight.remaining_seats} Left
                    </div>
                )}
            </div>

            {/* Flight Times & Duration */}
            <div className="flex-1 w-full grid grid-cols-3 items-center gap-4 text-center">
                <div className="space-y-1">
                    <p className="text-2xl font-black text-slate-900">{formatTime(flight.departure_time)}</p>
                    <p className="text-xs font-medium text-slate-500">{formatDate(flight.departure_time)}</p>
                </div>

                <div className="flex flex-col items-center gap-1 group">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        {durationHours}h {durationMinutes}m
                    </p>
                    <div className="relative w-full max-w-[80px] h-px bg-slate-200">
                        <div className="absolute top-1/2 left-0 w-1 h-1 bg-slate-300 rounded-full -translate-y-1/2" />
                        <div className="absolute top-1/2 right-0 w-1 h-1 bg-slate-300 rounded-full -translate-y-1/2" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                            </svg>
                        </div>
                    </div>
                    <p className="text-[10px] font-bold text-blue-600/60 uppercase tracking-widest">
                        {flight.stops === 0 ? "Non-stop" : `${flight.stops} Stop${flight.stops > 1 ? 's' : ''}`}
                    </p>
                </div>

                <div className="space-y-1">
                    <p className="text-2xl font-black text-slate-900">{formatTime(flight.arrival_time)}</p>
                    <p className="text-xs font-medium text-slate-500">{formatDate(flight.arrival_time)}</p>
                </div>
            </div>

            {/* Price & Action */}
            <div className="md:w-48 text-center md:text-right space-y-3 w-full border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                <div className="space-y-0.5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Price</p>
                    <p className="text-3xl font-black text-blue-600 tabular-nums tracking-tighter">{formattedPrice}</p>
                </div>
                <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full py-6 text-base shadow-lg shadow-blue-100 active:scale-95 transition-all">
                    <a href={`/flights/book/${flight.offer_id}?provider=${flight.provider}`}>
                        Select Flight
                    </a>
                </Button>
            </div>
        </div>
    );
}
