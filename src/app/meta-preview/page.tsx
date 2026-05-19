const options = [
  {
    key: 'a',
    label: 'A — Dark Premium',
    title: 'CheapestGo — Stop Overpaying for Travel',
    description: 'Compare hotels and flights across hundreds of providers in seconds. Real prices, no markup, no surprises.',
  },
  {
    key: 'b',
    label: 'B — Destination / Sunset',
    title: 'CheapestGo | The World, for Less',
    description: "From Jeju to Lisbon, find the lowest hotel and flight prices anywhere on Earth. CheapestGo searches so you don't have to.",
  },
  {
    key: 'c',
    label: 'C — Clean Split',
    title: 'CheapestGo | Your Travel OS',
    description: 'One app to search, compare, and book hotels and flights worldwide. Powered by real-time pricing across global providers.',
  },
  {
    key: 'd',
    label: 'D — Bold Gradient',
    title: 'CheapestGo | Book Before Prices Change',
    description: 'Live hotel and flight prices that actually update. No cached results, no inflated rates. Find your deal and lock it in.',
  },
];

export default function MetaPreview() {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 p-8 font-sans">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">OG Image Options</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-10">
        Each option shows the OG image + how it appears in Google, Twitter, and Slack previews.
      </p>

      <div className="flex flex-col gap-20">
        {options.map((opt) => (
          <div key={opt.key} className="flex flex-col gap-5">

            {/* Label */}
            <div className="flex items-center gap-3">
              <span className="inline-block bg-indigo-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                {opt.label}
              </span>
            </div>

            {/* OG Image — actual generated image */}
            <div className="flex flex-col gap-1">
              <p className="text-[11px] uppercase tracking-widest text-gray-400 font-medium mb-2">OG Image (1200×630)</p>
              <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-3xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/og?design=${opt.key}`}
                  alt={opt.title}
                  className="w-full"
                  style={{ aspectRatio: '1200/630', objectFit: 'cover' }}
                />
              </div>
            </div>

            {/* Downstream previews */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">

              {/* Google Snippet */}
              <div className="flex flex-col gap-1">
                <p className="text-[11px] uppercase tracking-widest text-gray-400 font-medium mb-1">Google</p>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
                  <p className="text-[12px] text-gray-400 mb-0.5">cheapestgo.com</p>
                  <p className="text-[15px] text-blue-700 dark:text-blue-400 font-medium leading-snug mb-1 line-clamp-2">
                    {opt.title}
                  </p>
                  <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-snug line-clamp-3">
                    {opt.description}
                  </p>
                </div>
              </div>

              {/* Twitter Card */}
              <div className="flex flex-col gap-1">
                <p className="text-[11px] uppercase tracking-widest text-gray-400 font-medium mb-1">Twitter / X</p>
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-hidden" style={{ aspectRatio: '1200/630' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/og?design=${opt.key}`} alt={opt.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[12px] font-semibold text-gray-900 dark:text-white line-clamp-1">{opt.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">cheapestgo.com</p>
                  </div>
                </div>
              </div>

              {/* Slack / iMessage */}
              <div className="flex flex-col gap-1">
                <p className="text-[11px] uppercase tracking-widest text-gray-400 font-medium mb-1">Slack / iMessage</p>
                <div className="bg-white dark:bg-gray-800 border-l-4 border-indigo-500 shadow-sm overflow-hidden rounded-r-xl">
                  <div className="overflow-hidden" style={{ aspectRatio: '1200/630' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/og?design=${opt.key}`} alt={opt.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-[10px] text-indigo-500 uppercase tracking-wide font-semibold mb-0.5">cheapestgo.com</p>
                    <p className="text-[12px] font-semibold text-gray-900 dark:text-white line-clamp-1">{opt.title}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{opt.description}</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}
