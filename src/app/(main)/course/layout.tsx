/**
 * The course portal's surface: the golf theme tokens (globals.css), so it reads as the same
 * product as the golf pages. Pages inside are plain `div`s; the site layout owns `main`.
 */
export default function CourseLayout({ children }: { children: React.ReactNode }) {
    return <div className="golf-theme min-h-[70dvh] text-g-ink">{children}</div>;
}
