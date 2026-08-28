import { LocalizedText } from '../common';

/**
 * The product taxonomy. New members may be added freely; nothing in the platform
 * layer switches exhaustively on this enum for behaviour — behaviour is driven by
 * fulfillment method and checkout requirements instead.
 */
export enum ProductType {
  DigitalCode = 'DIGITAL_CODE',
  GiftCard = 'GIFT_CARD',
  Subscription = 'SUBSCRIPTION',
  GameCurrency = 'GAME_CURRENCY',
  Dlc = 'DLC',
  Game = 'GAME',
  PlayerService = 'PLAYER_SERVICE',
  AccountService = 'ACCOUNT_SERVICE',
  Other = 'OTHER',
}

export interface ProductTypeDescriptor {
  readonly type: ProductType;
  readonly label: LocalizedText;
  readonly icon: string;
}
