/**
 * The brand, in one place.
 *
 * Every customer-visible mention of the company resolves from here: page titles,
 * metadata, the header wordmark, the footer, legal copy. Nothing hard-codes the
 * name in a template.
 *
 * That matters more than tidiness. A name is a commercial decision that can
 * change late, and when it does this file is the change rather than a sweep
 * through forty templates hoping none were missed.
 *
 * Internal identifiers are deliberately NOT here. The `localStorage` cart key,
 * database table names and the npm package name keep their original values:
 * renaming a storage key would empty every existing customer's cart, and a
 * customer-facing brand is not the same thing as a technical identifier.
 */

export interface BrandIdentity {
  /** Exact casing, used verbatim everywhere it is displayed. */
  readonly name: string;
  /** Split for the wordmark, which weights the two halves differently. */
  readonly nameParts: readonly [string, string];
  /** Two-letter monogram for tight spaces such as a favicon. */
  readonly monogram: string;
  readonly tagline: { readonly he: string; readonly en: string };
  readonly description: { readonly he: string; readonly en: string };
  /** Separator between a page name and the brand in a document title. */
  readonly titleSeparator: string;
  readonly launchYear: number;
}

export const BRAND: BrandIdentity = {
  name: 'EASYCOINS',
  nameParts: ['EASY', 'COINS'],
  monogram: 'EC',

  // The name is the promise. Buying game currency is normally a small ordeal:
  // working out which bundle, what it really costs per coin, whether the seller
  // is real. The brand claims the opposite, so the tagline says the thing the
  // shop is actually competing on rather than describing the product.
  tagline: {
    he: 'קוינס בלי כאב ראש',
    en: 'Coins without the hassle',
  },

  description: {
    he: 'קוינס ל-EA SPORTS FC במחיר ישראלי. פלטפורמה, אזור חנות וזמן אספקה מופיעים לפני שמשלמים.',
    en: 'EA SPORTS FC coins at Israeli prices. Platform, store region and delivery time shown before you pay.',
  },

  titleSeparator: ' · ',
  launchYear: 2026,
};

/** Builds a document title. `pageTitle` omitted gives the landing-page title. */
export function brandTitle(pageTitle?: string): string {
  return pageTitle
    ? `${pageTitle}${BRAND.titleSeparator}${BRAND.name}`
    : `${BRAND.name}${BRAND.titleSeparator}${BRAND.tagline.he}`;
}
