import { Observable } from 'rxjs';
import {
  CatalogFacets, CatalogQuery, Game, GameId, Offer, OfferId, Page, Platform,
  Product, ProductDetail, Region, Slug,
} from '../../domain';

/**
 * API boundary for catalog reads.
 *
 * These are abstract classes rather than interfaces so they double as Angular DI
 * tokens. UI code depends on this type; only the provider in `data/providers.ts`
 * decides whether the mock or a future HTTP implementation is bound to it.
 */
export abstract class CatalogApiService {
  abstract getGames(): Observable<readonly Game[]>;
  abstract getGameBySlug(slug: Slug): Observable<Game>;
  abstract getPlatforms(): Observable<readonly Platform[]>;
  abstract getRegions(): Observable<readonly Region[]>;
  abstract getFacets(): Observable<CatalogFacets>;
  abstract searchProducts(query: CatalogQuery): Observable<Page<Product>>;
  abstract getFeaturedProducts(limit: number): Observable<readonly Product[]>;
  abstract getProductsByGame(gameId: GameId): Observable<readonly Product[]>;
}

export abstract class ProductApiService {
  abstract getProductBySlug(slug: Slug): Observable<ProductDetail>;
  abstract getOffers(productSlug: Slug): Observable<readonly Offer[]>;
  abstract getOfferById(offerId: OfferId): Observable<Offer>;
  abstract getRelatedProducts(slug: Slug, limit: number): Observable<readonly Product[]>;
}
