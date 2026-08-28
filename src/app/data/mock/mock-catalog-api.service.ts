import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CatalogFacets, CatalogQuery, CatalogSort, DEFAULT_PAGE_SIZE, Game, GameId, Offer, OfferId,
  Page, Platform, Product, ProductDetail, Region, Slug, paginate, resolveText,
} from '../../domain';
import { CatalogApiService, ProductApiService } from '../api';
import { GAMES, OFFERS, PLATFORMS, PRODUCTS, REGIONS } from './catalog.seed';
import { MockBackendService } from './mock-backend.service';

/** Lowest current price across a product's offers, in minor units. */
function minPriceMinor(productId: string): number {
  const prices = OFFERS.filter((offer) => offer.productId === productId).map((offer) => offer.price.current.amountMinor);
  return prices.length === 0 ? 0 : Math.min(...prices);
}

function matches(product: Product, query: CatalogQuery): boolean {
  if (!product.active) {
    return false;
  }
  if (query.featuredOnly === true && !product.featured) {
    return false;
  }
  if (query.gameIds?.length && !query.gameIds.includes(product.gameId)) {
    return false;
  }
  if (query.types?.length && !query.types.includes(product.type)) {
    return false;
  }
  if (query.platformIds?.length && !product.platformIds.some((id) => query.platformIds!.includes(id))) {
    return false;
  }
  if (query.regionIds?.length && !product.regionIds.some((id) => query.regionIds!.includes(id))) {
    return false;
  }
  if (query.tags?.length && !product.tags.some((tag) => query.tags!.includes(tag))) {
    return false;
  }

  const price = minPriceMinor(product.id);
  if (query.minPriceMinor !== undefined && price < query.minPriceMinor) {
    return false;
  }
  if (query.maxPriceMinor !== undefined && price > query.maxPriceMinor) {
    return false;
  }

  const search = query.search?.trim().toLowerCase();
  if (search) {
    const haystack = [
      resolveText(product.name), resolveText(product.name, 'en'),
      resolveText(product.shortDescription), resolveText(product.description),
      product.slug, ...product.tags,
    ].join(' ').toLowerCase();
    if (!haystack.includes(search)) {
      return false;
    }
  }
  return true;
}

function compare(a: Product, b: Product, sort: CatalogSort): number {
  switch (sort) {
    case 'price-asc':
      return minPriceMinor(a.id) - minPriceMinor(b.id);
    case 'price-desc':
      return minPriceMinor(b.id) - minPriceMinor(a.id);
    case 'name-asc':
      return resolveText(a.name).localeCompare(resolveText(b.name), 'he');
    case 'popular':
      return (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
    case 'newest':
      return PRODUCTS.indexOf(b) - PRODUCTS.indexOf(a);
    case 'relevance':
    default:
      return Number(b.featured) - Number(a.featured) || (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
  }
}

@Injectable()
export class MockCatalogApiService extends CatalogApiService {
  private readonly backend = inject(MockBackendService);

  getGames(): Observable<readonly Game[]> {
    const games = [...GAMES].filter((game) => game.active).sort((a, b) => a.sortOrder - b.sortOrder);
    return this.backend.respond(games);
  }

  getGameBySlug(slug: Slug): Observable<Game> {
    return this.backend.respondOrNotFound(GAMES.find((game) => game.slug === slug), `Game "${slug}"`);
  }

  getPlatforms(): Observable<readonly Platform[]> {
    return this.backend.respond([...PLATFORMS].sort((a, b) => a.sortOrder - b.sortOrder));
  }

  getRegions(): Observable<readonly Region[]> {
    return this.backend.respond(REGIONS);
  }

  getFacets(): Observable<CatalogFacets> {
    const prices = OFFERS.map((offer) => offer.price.current.amountMinor);
    return this.backend.respond<CatalogFacets>({
      gameIds: GAMES.map((game) => game.id),
      platformIds: [...new Set(PRODUCTS.flatMap((product) => product.platformIds))],
      regionIds: [...new Set(PRODUCTS.flatMap((product) => product.regionIds))],
      types: [...new Set(PRODUCTS.map((product) => product.type))],
      tags: [...new Set(PRODUCTS.flatMap((product) => product.tags))],
      minPriceMinor: Math.min(...prices),
      maxPriceMinor: Math.max(...prices),
    });
  }

  searchProducts(query: CatalogQuery): Observable<Page<Product>> {
    const filtered = PRODUCTS.filter((product) => matches(product, query))
      .sort((a, b) => compare(a, b, query.sort ?? 'relevance'));
    const page = paginate(filtered, query.page ?? { page: 1, pageSize: DEFAULT_PAGE_SIZE });
    return this.backend.respond(page);
  }

  getFeaturedProducts(limit: number): Observable<readonly Product[]> {
    const featured = PRODUCTS.filter((product) => product.active && product.featured).slice(0, limit);
    return this.backend.respond(featured);
  }

  getProductsByGame(gameId: GameId): Observable<readonly Product[]> {
    return this.backend.respond(PRODUCTS.filter((product) => product.active && product.gameId === gameId));
  }
}

@Injectable()
export class MockProductApiService extends ProductApiService {
  private readonly backend = inject(MockBackendService);

  getProductBySlug(slug: Slug): Observable<ProductDetail> {
    const product = PRODUCTS.find((candidate) => candidate.slug === slug);
    if (!product) {
      return this.backend.respondOrNotFound<ProductDetail>(undefined, `Product "${slug}"`);
    }
    const offers = OFFERS.filter((offer) => offer.productId === product.id && offer.active);
    return this.backend.respond<ProductDetail>({ product, offers });
  }

  getOffers(productSlug: Slug): Observable<readonly Offer[]> {
    const product = PRODUCTS.find((candidate) => candidate.slug === productSlug);
    if (!product) {
      return this.backend.respondOrNotFound<readonly Offer[]>(undefined, `Product "${productSlug}"`);
    }
    return this.backend.respond(OFFERS.filter((offer) => offer.productId === product.id && offer.active));
  }

  getOfferById(offerId: OfferId): Observable<Offer> {
    return this.backend.respondOrNotFound(OFFERS.find((offer) => offer.id === offerId), `Offer "${offerId}"`);
  }

  getRelatedProducts(slug: Slug, limit: number): Observable<readonly Product[]> {
    const product = PRODUCTS.find((candidate) => candidate.slug === slug);
    if (!product) {
      return this.backend.respond<readonly Product[]>([]);
    }
    const sameGame = PRODUCTS.filter((candidate) => candidate.id !== product.id && candidate.gameId === product.gameId);
    const sharedTag = PRODUCTS.filter((candidate) => candidate.id !== product.id
      && candidate.gameId !== product.gameId
      && candidate.tags.some((tag) => product.tags.includes(tag)));
    return this.backend.respond([...sameGame, ...sharedTag].slice(0, limit));
  }
}
