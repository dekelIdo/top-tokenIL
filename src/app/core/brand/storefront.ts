/**
 * What the storefront actually sells today.
 *
 * ZuzCOINS is built as a multi-game commerce platform: the catalog, the domain
 * and the backend all handle several games without knowing which. The shop we
 * are opening does not. It sells EA SPORTS FC, and pretending otherwise would
 * mean a customer clicking "games" to find a list of one.
 *
 * This is the single place that decides. Selling a second game later is a change
 * to this file plus catalog data, not a redesign: the architecture stays
 * general, the storefront stays deliberately narrow.
 */
export const STOREFRONT = {
  /** The game the shop is built around. Matches a `games.slug` in the catalog. */
  focusGameSlug: 'ea-sports-fc',

  /** Shown wherever the game needs naming in copy. */
  focusGameName: 'EA SPORTS FC',

  /**
   * Whether to surface game browsing at all. False collapses the game routes
   * out of navigation; the routes still resolve, so an existing link keeps
   * working.
   */
  showGameNavigation: false,
} as const;
