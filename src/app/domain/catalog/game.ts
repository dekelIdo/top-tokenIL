import { GameId, ImageAsset, LocalizedText, PlatformId, Slug } from '../common';

/**
 * A Game groups products. EA FC is the first one; adding NBA 2K or Fortnite is a
 * data change, never a code change.
 */
export interface Game {
  readonly id: GameId;
  readonly slug: Slug;
  readonly name: LocalizedText;
  readonly publisher: string;
  readonly shortDescription: LocalizedText;
  readonly platformIds: readonly PlatformId[];
  readonly cover?: ImageAsset;
  readonly hero?: ImageAsset;
  /** Accent colour used by GameCard / hero surfaces. CSS colour string. */
  readonly accentColor?: string;
  readonly active: boolean;
  readonly featured: boolean;
  readonly sortOrder: number;
}
