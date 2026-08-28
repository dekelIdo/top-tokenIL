import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';

import {
  CatalogQuery, DEFAULT_PAGE_SIZE, FulfillmentDescriptor, FulfillmentMethod, Game, Offer, Page,
  Platform, PlatformId, Product, ProductDetail, Region, RegionId, Slug,
} from '../domain';
import { CatalogApiService, FulfillmentApiService, ProductApiService } from '../data/api';

/**
 * Resolved reference data. Components render platforms, regions and delivery
 * methods through these maps instead of comparing against literal strings like
 * "PlayStation", which is what keeps the UI game-agnostic.
 */
export interface CatalogLookups {
  readonly games: readonly Game[];
  readonly platforms: ReadonlyMap<PlatformId, Platform>;
  readonly regions: ReadonlyMap<RegionId, Region>;
  readonly fulfillment: ReadonlyMap<FulfillmentMethod, FulfillmentDescriptor>;
}

@Injectable({ providedIn: 'root' })
export class CatalogFacade {
  private readonly catalogApi = inject(CatalogApiService);
  private readonly productApi = inject(ProductApiService);
  private readonly fulfillmentApi = inject(FulfillmentApiService);

  /**
   * Reference data is small, stable and needed by nearly every screen, so it is
   * fetched once and shared. `shareReplay({ refCount: false })` keeps it warm for
   * the session; it is never invalidated because a page reload refetches anyway.
   */
  readonly lookups$: Observable<CatalogLookups> = combineLatest([
    this.catalogApi.getGames(),
    this.catalogApi.getPlatforms(),
    this.catalogApi.getRegions(),
    this.fulfillmentApi.getDescriptors(),
  ]).pipe(
    map(([games, platforms, regions, fulfillment]): CatalogLookups => ({
      games,
      platforms: new Map(platforms.map((platform) => [platform.id, platform])),
      regions: new Map(regions.map((region) => [region.id, region])),
      fulfillment: new Map(fulfillment.map((descriptor) => [descriptor.method, descriptor])),
    })),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly games$ = this.lookups$.pipe(map((lookups) => lookups.games));

  search(query: CatalogQuery): Observable<Page<Product>> {
    return this.catalogApi.searchProducts({
      ...query,
      page: query.page ?? { page: 1, pageSize: DEFAULT_PAGE_SIZE },
    });
  }

  featured(limit = 6): Observable<readonly Product[]> {
    return this.catalogApi.getFeaturedProducts(limit);
  }

  gameBySlug(slug: Slug): Observable<Game> {
    return this.catalogApi.getGameBySlug(slug);
  }

  productsForGame(slug: Slug): Observable<readonly Product[]> {
    return this.catalogApi.getGameBySlug(slug).pipe(
      switchMap((game) => this.catalogApi.getProductsByGame(game.id)),
    );
  }

  productBySlug(slug: Slug): Observable<ProductDetail> {
    return this.productApi.getProductBySlug(slug);
  }

  relatedProducts(slug: Slug, limit = 4): Observable<readonly Product[]> {
    return this.productApi.getRelatedProducts(slug, limit).pipe(catchError(() => of([] as readonly Product[])));
  }

  offerById(offerId: string): Observable<Offer> {
    return this.productApi.getOfferById(offerId);
  }
}
