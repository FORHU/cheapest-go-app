import React from 'react';

interface Section {
  title: string;
  content: React.ReactNode;
}

interface LegalLayoutProps {
  title: string;
  subtitle: string;
  effectiveDate: string;
  lastUpdated: string;
  sections: Section[];
}

export const LegalLayout: React.FC<LegalLayoutProps> = ({
  title,
  subtitle,
  effectiveDate,
  lastUpdated,
  sections,
}) => {
  return (
    <main className="min-h-screen">
      {/* Header band */}
      <div className="bg-obsidian dark:bg-obsidian border-b border-white/5 px-4 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-obsidian-accent mb-3 font-display">
            CheapestGo · Legal
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-3 tracking-tight text-white font-display">
            {title}
          </h1>
          <p className="text-slate-400 text-sm sm:text-base">{subtitle}</p>
          <div className="flex flex-wrap gap-4 mt-5 text-xs text-slate-500">
            <span>Effective: <strong className="text-slate-300">{effectiveDate}</strong></span>
            <span>Last updated: <strong className="text-slate-300">{lastUpdated}</strong></span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        {/* Disclaimer */}
        <div className="bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-alabaster-border dark:border-obsidian-border rounded-xl p-4 mb-10 text-sm text-slate-600 dark:text-slate-400">
          <strong className="text-slate-800 dark:text-slate-200">Note:</strong>{' '}
          This document is provided for informational purposes. CheapestGo recommends
          consulting a qualified attorney to review these terms for your specific jurisdiction before
          publishing to production.
        </div>

        {/* Table of contents */}
        <nav className="bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-alabaster-border dark:border-obsidian-border rounded-xl p-5 mb-10">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3 font-display">
            Contents
          </p>
          <ol className="space-y-1.5">
            {sections.map((s, i) => (
              <li key={i}>
                <a
                  href={`#section-${i + 1}`}
                  className="text-sm text-alabaster-accent dark:text-obsidian-accent hover:underline underline-offset-2"
                >
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Sections */}
        <div className="space-y-10">
          {sections.map((s, i) => (
            <section key={i} id={`section-${i + 1}`} className="scroll-mt-24">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2 font-display">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-alabaster-accent/10 dark:bg-obsidian-accent/10 text-alabaster-accent dark:text-obsidian-accent text-xs font-bold shrink-0 font-mono">
                  {i + 1}
                </span>
                {s.title}
              </h2>
              <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-3 pl-9 [&_a]:text-alabaster-accent [&_a]:dark:text-obsidian-accent [&_a]:hover:underline [&_a]:underline-offset-2">
                {s.content}
              </div>
            </section>
          ))}
        </div>

        {/* Footer contact */}
        <div className="mt-14 pt-8 border-t border-alabaster-border dark:border-obsidian-border text-sm text-slate-500 dark:text-slate-400">
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1 font-display">Questions about this document?</p>
          <p>
            Contact us at{' '}
            <a href="mailto:support@cheapestgo.com" className="text-alabaster-accent dark:text-obsidian-accent hover:underline underline-offset-2">
              support@cheapestgo.com
            </a>
          </p>
          <p className="mt-1">JTP Partners · 30 Wall Street, 8th Floor · New York, NY 10005 · United States</p>
        </div>
      </div>
    </main>
  );
};
