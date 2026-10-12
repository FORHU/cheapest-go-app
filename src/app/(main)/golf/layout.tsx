/**
 * The golf pages' surface. The palette and the heading face are the site's own, carried by the
 * `.golf-theme` tokens in globals.css, so this only scopes them: no font is loaded here and the
 * page background is the site's. Pages inside are plain `div`s: the site layout already owns `main`.
 */
export default function GolfLayout({ children }: { children: React.ReactNode }) {
    return <div className="golf-theme min-h-[70dvh] text-g-ink">{children}</div>;
}
