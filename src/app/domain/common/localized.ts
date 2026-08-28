export type LocaleCode = 'he' | 'en';

export const DEFAULT_LOCALE: LocaleCode = 'he';

/**
 * Every customer-facing string in the domain is localized. The Hebrew value is
 * required because the storefront is Hebrew-first; English is optional until the
 * English catalog is filled in, and resolution falls back to Hebrew.
 */
export interface LocalizedText {
  readonly he: string;
  readonly en?: string;
}

export function resolveText(text: LocalizedText, locale: LocaleCode = DEFAULT_LOCALE): string {
  if (locale === 'en') {
    return text.en ?? text.he;
  }
  return text.he;
}

export function localized(he: string, en?: string): LocalizedText {
  return en === undefined ? { he } : { he, en };
}
