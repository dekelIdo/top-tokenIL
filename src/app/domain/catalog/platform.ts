import { ImageAsset, LocalizedText, PlatformId } from '../common';

/**
 * Platforms are data, not code branches. Components must never compare against
 * the string "PlayStation" — they render a Platform record supplied by the API.
 */
export enum PlatformKind {
  PlayStation5 = 'PLAYSTATION_5',
  PlayStation4 = 'PLAYSTATION_4',
  Xbox = 'XBOX',
  Pc = 'PC',
  Mobile = 'MOBILE',
  MultiPlatform = 'MULTI_PLATFORM',
}

/** Console families let the UI group PS4/PS5 without hard-coding either. */
export enum PlatformFamily {
  PlayStation = 'PLAYSTATION',
  Xbox = 'XBOX',
  Pc = 'PC',
  Mobile = 'MOBILE',
  Any = 'ANY',
}

export interface Platform {
  readonly id: PlatformId;
  readonly kind: PlatformKind;
  readonly family: PlatformFamily;
  readonly name: LocalizedText;
  readonly shortName: LocalizedText;
  readonly icon?: ImageAsset;
  readonly sortOrder: number;
}
