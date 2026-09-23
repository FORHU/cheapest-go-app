import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { applyBrand } from './applyBrand';

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const srcVal = source[key];
    if (srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal)) {
      result[key] = deepMerge(
        (result[key] as Record<string, unknown>) || {},
        srcVal as Record<string, unknown>,
      ) as T[keyof T];
    } else if (srcVal !== undefined) {
      result[key] = srcVal as T[keyof T];
    }
  }
  return result;
}

export default getRequestConfig(async ({ requestLocale }) => {
  // Priority: brand lock > URL-based locale (from middleware header) > default.
  //
  // The cookie itself is read in middleware, not here: middleware either rewrites a
  // prefixed URL (/ko/...) to set the header, or redirects an unprefixed request whose
  // sticky cookie names a non-default locale to its prefixed URL, and otherwise sets the
  // header to the default locale explicitly. That means requestLocale always resolves
  // for a real request. Reading cookies()/headers() directly in this function — as a
  // previous version of this fallback did — forces Next.js to render the page
  // dynamically on every request, silently disabling ISR (export const revalidate) on
  // every page that uses translations. During the build's static-generation pass (no
  // real request, no middleware), requestLocale resolves to undefined and we fall back
  // to the static default below.
  const locked = process.env.NEXT_PUBLIC_LOCALE;

  let locale: string;
  if (locked && routing.locales.includes(locked as typeof routing.locales[number])) {
    locale = locked;
  } else {
    const fromMiddleware = await requestLocale;
    locale = (fromMiddleware && routing.locales.includes(fromMiddleware as typeof routing.locales[number]))
      ? fromMiddleware
      : routing.defaultLocale;
  }

  const enMessages = (await import(`../locales/en.json`)).default;

  if (locale === 'en') {
    return { locale, messages: applyBrand(enMessages) };
  }

  const localeMessages = (await import(`../locales/${locale}.json`)).default;

  // Brand after merging, so keys a locale hasn't translated yet inherit the English
  // string and get branded too rather than falling back to the wrong name.
  return {
    locale,
    messages: applyBrand(deepMerge(enMessages, localeMessages)),
  };
});
