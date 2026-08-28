import { IsoDateTime, ProductId, ReviewId } from '../common';

export interface Review {
  readonly id: ReviewId;
  readonly productId?: ProductId;
  readonly authorDisplayName: string;
  readonly rating: 1 | 2 | 3 | 4 | 5;
  readonly title?: string;
  readonly body: string;
  readonly createdAt: IsoDateTime;
  /** True when the review is attached to a real, fulfilled order. */
  readonly verifiedPurchase: boolean;
}

export interface ReviewSummary {
  readonly average: number;
  readonly count: number;
  /** Index 0 = one star, index 4 = five stars. */
  readonly distribution: readonly [number, number, number, number, number];
}
