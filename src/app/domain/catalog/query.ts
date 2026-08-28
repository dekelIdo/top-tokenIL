import { GameId, PageRequest, PlatformId, RegionId } from '../common';
import { ProductType } from './product-type';

export type CatalogSort =
  | 'relevance'
  | 'price-asc'
  | 'price-desc'
  | 'name-asc'
  | 'newest'
  | 'popular';

/**
 * Generic across every product category — deliberately no "coin amount" filter.
 * Category-specific narrowing goes through `tags` or a future typed facet API.
 */
export interface CatalogQuery {
  readonly search?: string;
  readonly gameIds?: readonly GameId[];
  readonly platformIds?: readonly PlatformId[];
  readonly regionIds?: readonly RegionId[];
  readonly types?: readonly ProductType[];
  readonly tags?: readonly string[];
  readonly minPriceMinor?: number;
  readonly maxPriceMinor?: number;
  readonly featuredOnly?: boolean;
  readonly sort?: CatalogSort;
  readonly page?: PageRequest;
}

export const EMPTY_CATALOG_QUERY: CatalogQuery = { sort: 'relevance' };

/** Everything the storefront needs to render filter controls, resolved from data. */
export interface CatalogFacets {
  readonly gameIds: readonly GameId[];
  readonly platformIds: readonly PlatformId[];
  readonly regionIds: readonly RegionId[];
  readonly types: readonly ProductType[];
  readonly tags: readonly string[];
  readonly minPriceMinor: number;
  readonly maxPriceMinor: number;
}
