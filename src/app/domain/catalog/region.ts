import { CurrencyCode, LocalizedText, RegionId } from '../common';

/**
 * Region is first-class because digital vouchers are region-locked. A customer
 * buying an IL PlayStation Store card for a US account gets an unusable code,
 * so region must be visible on the offer, in the cart and at checkout.
 */
export enum RegionCode {
  Israel = 'IL',
  UnitedStates = 'US',
  UnitedKingdom = 'UK',
  Europe = 'EU',
  Global = 'GLOBAL',
}

export interface Region {
  readonly id: RegionId;
  readonly code: RegionCode;
  readonly name: LocalizedText;
  readonly currency: CurrencyCode;
  readonly flagEmoji: string;
  /** True when the item works on any account regardless of store country. */
  readonly isRegionFree: boolean;
  /** Shown verbatim next to the region badge, e.g. "works only on IL accounts". */
  readonly restrictionNotice?: LocalizedText;
}
