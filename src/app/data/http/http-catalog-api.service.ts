import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  CatalogFacets, CatalogQuery, DEFAULT_PAGE_SIZE, Game, GameId, Offer, OfferId, Page, Platform,
  Product, ProductDetail, Region, Slug,
} from '../../domain';
import { CatalogApiService, ProductApiService } from '../api';
import { ApiClient } from './api-client.service';
import * as Dto from './dto';
import * as Map from './mappers';

/**
 * Catalog reads over HTTP.
 *
 * Every method is a thin translation: build the request, hand the response to a
 * mapper, return domain objects. No business rules live here — that is what
 * keeps the mock and HTTP implementations from drifting apart.
 */
@Injectable()
export class HttpCatalogApiService extends CatalogApiService {
  private readonly api = inject(ApiClient);

  getGames(): Observable<readonly Game[]> {
    return this.api.get<Dto.GameDto[]>('/games').pipe(map((dtos) => dtos.map(Map.toGame)));
  }

  getGameBySlug(slug: Slug): Observable<Game> {
    return this.api.get<Dto.GameDto>(`/games/${encodeURIComponent(slug)}`).pipe(map(Map.toGame));
  }

  getPlatforms(): Observable<readonly Platform[]> {
    return this.api.get<Dto.PlatformDto[]>('/platforms').pipe(map((dtos) => dtos.map(Map.toPlatform)));
  }

  getRegions(): Observable<readonly Region[]> {
    return this.api.get<Dto.RegionDto[]>('/regions').pipe(map((dtos) => dtos.map(Map.toRegion)));
  }

  getFacets(): Observable<CatalogFacets> {
    return this.api.get<Dto.CatalogFacetsDto>('/catalog/facets').pipe(map(Map.toFacets));
  }

  searchProducts(query: CatalogQuery): Observable<Page<Product>> {
    return this.api.get<Dto.PageDto<Dto.ProductDto>>('/products', {
      params: {
        search: query.search,
        gameIds: query.gameIds,
        platformIds: query.platformIds,
        regionIds: query.regionIds,
        types: query.types,
        tags: query.tags,
        minPriceMinor: query.minPriceMinor,
        maxPriceMinor: query.maxPriceMinor,
        featuredOnly: query.featuredOnly,
        sort: query.sort,
        page: query.page?.page ?? 1,
        pageSize: query.page?.pageSize ?? DEFAULT_PAGE_SIZE,
      },
    }).pipe(map((dto) => Map.toPage(dto, Map.toProduct)));
  }

  getFeaturedProducts(limit: number): Observable<readonly Product[]> {
    return this.api.get<Dto.PageDto<Dto.ProductDto>>('/products', {
      params: { featuredOnly: true, pageSize: limit, page: 1 },
    }).pipe(map((dto) => Map.toPage(dto, Map.toProduct).items));
  }

  getProductsByGame(gameId: GameId): Observable<readonly Product[]> {
    return this.api.get<Dto.PageDto<Dto.ProductDto>>('/products', {
      params: { gameIds: [gameId], pageSize: 100, page: 1 },
    }).pipe(map((dto) => Map.toPage(dto, Map.toProduct).items));
  }
}

@Injectable()
export class HttpProductApiService extends ProductApiService {
  private readonly api = inject(ApiClient);

  getProductBySlug(slug: Slug): Observable<ProductDetail> {
    return this.api.get<Dto.ProductDetailDto>(`/products/${encodeURIComponent(slug)}`)
      .pipe(map(Map.toProductDetail));
  }

  getOffers(productSlug: Slug): Observable<readonly Offer[]> {
    return this.api.get<Dto.OfferDto[]>('/offers', { params: { productSlug } })
      .pipe(map((dtos) => dtos.map(Map.toOffer)));
  }

  getOfferById(offerId: OfferId): Observable<Offer> {
    return this.api.get<Dto.OfferDto>(`/offers/${encodeURIComponent(offerId)}`).pipe(map(Map.toOffer));
  }

  getRelatedProducts(slug: Slug, limit: number): Observable<readonly Product[]> {
    return this.api.get<Dto.ProductDto[]>(`/products/${encodeURIComponent(slug)}/related`, {
      params: { limit },
    }).pipe(map((dtos) => dtos.map(Map.toProduct)));
  }
}
