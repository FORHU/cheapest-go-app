import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { routing } from './routing';

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
  // Priority: brand lock > URL-based locale (from middleware header) > cookie > default
  const locked = process.env.NEXT_PUBLIC_LOCALE;

  let locale: string;
  if (locked && routing.locales.includes(locked as typeof routing.locales[number])) {
    locale = locked;
  } else {
    const fromMiddleware = await requestLocale;
    if (fromMiddleware && routing.locales.includes(fromMiddleware as typeof routing.locales[number])) {
      locale = fromMiddleware;
    } else {
      const cookieStore = await cookies();
      const fromCookie = cookieStore.get('locale')?.value;
      locale = (fromCookie && routing.locales.includes(fromCookie as typeof routing.locales[number]))
        ? fromCookie
        : 'en';
    }
  }

  const enMessages = (await import(`../locales/en.json`)).default;

  if (locale === 'en') {
    return { locale, messages: enMessages };
  }

  const localeMessages = (await import(`../locales/${locale}.json`)).default;

  return {
    locale,
    messages: deepMerge(enMessages, localeMessages),
  };
});
