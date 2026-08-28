import {
  CouponId, GameId, IsoDateTime, LocalizedText, Money, ProductId, PromotionId, Slug,
} from '../common';

export enum PromotionKind {
  PercentOff = 'PERCENT_OFF',
  AmountOff = 'AMOUNT_OFF',
  BundleDeal = 'BUNDLE_DEAL',
  FreeShippingEquivalent = 'PRIORITY_DELIVERY',
}

export interface Promotion {
  readonly id: PromotionId;
  readonly slug: Slug;
  readonly kind: PromotionKind;
  readonly title: LocalizedText;
  readonly description: LocalizedText;
  readonly bannerImageUrl?: string;
  readonly percentOff?: number;
  readonly amountOff?: Money;
  readonly gameIds?: readonly GameId[];
  readonly productIds?: readonly ProductId[];
  readonly startsAt: IsoDateTime;
  readonly endsAt?: IsoDateTime;
  readonly active: boolean;
}

export interface Coupon {
  readonly id: CouponId;
  readonly code: string;
  readonly promotionId: PromotionId;
  readonly minSubtotal?: Money;
  readonly expiresAt?: IsoDateTime;
  readonly active: boolean;
}

export interface CouponApplication {
  readonly applied: boolean;
  readonly code: string;
  readonly discount: Money;
  readonly message: LocalizedText;
}
