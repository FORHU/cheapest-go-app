import { Newsreader } from 'next/font/google';

/**
 * The golf pages' own surface: warm paper and fairway ink (the `.golf-theme` tokens in
 * globals.css) and an editorial serif for headings. The font is loaded here, not at the root, so
 * no other page pays for it. Pages inside are plain `div`s: the site layout already owns `main`.
 */
const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-golf-serif', display: 'swap', axes: ['opsz'] });

export default function GolfLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className={`${newsreader.variable} golf-theme min-h-[70dvh] bg-g-paper text-g-ink`}>
            {children}
        </div>
    );
}
