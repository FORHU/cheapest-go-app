import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

const locales = ['en', 'ko', 'cn', 'ja'];

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

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  // Default to Korean when the visitor has no explicit locale cookie.
  const locale = cookieStore.get('locale')?.value ?? 'ko';
  const validLocale = locales.includes(locale) ? locale : 'ko';

  const enMessages = (await import(`../locales/en.json`)).default;

  if (validLocale === 'en') {
    return { locale: validLocale, messages: enMessages };
  }

  const localeMessages = (await import(`../locales/${validLocale}.json`)).default;

  return {
    locale: validLocale,
    messages: deepMerge(enMessages, localeMessages),
  };
});