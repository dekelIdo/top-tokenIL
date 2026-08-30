import { Controller, Get, Param, Query } from '@nestjs/common';

import { CatalogService } from './catalog.service';

/**
 * Reads a repeatable query parameter.
 *
 * Express gives a single `?gameIds=a` as a string and `?gameIds=a&gameIds=b` as
 * an array, so both shapes have to be handled or filtering breaks whenever a
 * customer selects exactly one value. Entries are bounded because each one
 * becomes an `IN` argument.
 */
function toStringArray(value: unknown): string[] | undefined {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const cleaned = values
    .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    .slice(0, 50)
    .map((entry) => entry.slice(0, 100));
  return cleaned.length > 0 ? cleaned : undefined;
}

/** A query-string integer, or undefined when absent or unparseable. */
function toInteger(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

/**
 * The catalog.
 *
 * Every endpoint is public and read-only. None of them consults the session,
 * because what is for sale does not depend on who is asking.
 */
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('games')
  listGames() {
    return this.catalog.listGames();
  }

  @Get('games/:slug')
  getGame(@Param('slug') slug: string) {
    return this.catalog.getGameBySlug(slug);
  }

  @Get('platforms')
  listPlatforms() {
    return this.catalog.listPlatforms();
  }

  @Get('regions')
  listRegions() {
    return this.catalog.listRegions();
  }

  @Get('catalog/facets')
  getFacets() {
    return this.catalog.getFacets();
  }

  @Get('products')
  searchProducts(@Query() query: Record<string, unknown>) {
    return this.catalog.searchProducts({
      search: typeof query['search'] === 'string' ? query['search'] : undefined,
      gameIds: toStringArray(query['gameIds']),
      platformIds: toStringArray(query['platformIds']),
      regionIds: toStringArray(query['regionIds']),
      types: toStringArray(query['types']),
      tags: toStringArray(query['tags']),
      minPriceMinor: toInteger(query['minPriceMinor']),
      maxPriceMinor: toInteger(query['maxPriceMinor']),
      featuredOnly: query['featuredOnly'] === 'true',
      sort: typeof query['sort'] === 'string' ? query['sort'] : undefined,
      page: toInteger(query['page']) ?? 1,
      pageSize: toInteger(query['pageSize']) ?? 24,
    });
  }

  /**
   * Declared before `products/:slug` so that a product can never be named
   * `related` and shadow the route below it.
   */
  @Get('products/:slug/related')
  getRelated(@Param('slug') slug: string, @Query('limit') limit?: string) {
    return this.catalog.getRelatedProducts(slug, toInteger(limit) ?? 4);
  }

  @Get('products/:slug')
  getProduct(@Param('slug') slug: string) {
    return this.catalog.getProductBySlug(slug);
  }

  @Get('offers')
  listOffers(@Query('productSlug') productSlug: string) {
    return this.catalog.getOffersForProduct(productSlug);
  }

  @Get('offers/:offerId')
  getOffer(@Param('offerId') offerId: string) {
    return this.catalog.getOfferById(offerId);
  }
}
