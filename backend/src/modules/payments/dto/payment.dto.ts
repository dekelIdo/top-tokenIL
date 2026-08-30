import { Type } from 'class-transformer';
import { IsIn, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

/**
 * Payment requests.
 *
 * Note what cannot be sent: no amount, no currency, no status, and no card
 * field of any kind. There is no property here that could carry a PAN, an
 * expiry or a CVV, so the storefront is structurally unable to collect one.
 * The amount is read from the order; the outcome comes from the provider.
 */

export class InstrumentRefDto {
  /**
   * An opaque reference. For a real provider this is a token minted by its
   * hosted form; for the sandbox it selects a scenario. Never card data.
   */
  @IsString()
  @MaxLength(200)
  token!: string;
}

export class CreatePaymentIntentDto {
  @IsString()
  @MaxLength(100)
  checkoutSessionId!: string;

  @IsOptional()
  @IsIn(['MOCK'], { message: 'provider is not available' })
  provider?: string;
}

export class ConfirmPaymentDto {
  @IsObject()
  @ValidateNested()
  @Type(() => InstrumentRefDto)
  instrument!: InstrumentRefDto;
}
