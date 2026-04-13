"use client";
import { Printer, Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function PrintButton() {
    const [downloading, setDownloading] = useState(false);
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Extract booking ID from /trips/invoice/[id]
    const segments = pathname.split('/');
    const bookingId = segments[segments.length - 1];
    const type = searchParams.get('type') || 'flight';

    const handleDownloadPdf = async () => {
        setDownloading(true);
        try {
            const res = await fetch(`/api/invoice/${bookingId}/pdf?type=${type}`);
            if (!res.ok) throw new Error('PDF generation failed');

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `CheapestGo-Receipt-INV-${bookingId.slice(0, 8).toUpperCase()}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('PDF download error:', err);
            alert('Failed to download PDF. Please try again.');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={handleDownloadPdf}
                disabled={downloading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-wait text-white text-sm font-semibold rounded-xl transition-colors"
            >
                {downloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Download className="w-4 h-4" />
                )}
                {downloading ? 'Generating…' : 'Download PDF'}
            </button>
            <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
                <Printer className="w-4 h-4" />
                Print
            </button>
        </div>
    );
}
