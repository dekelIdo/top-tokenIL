import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const FULFILLMENT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'WAITING_FOR_CUSTOMER',
  'READY',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
] as const;

/** Filters for the operator queue. */
export class QueueQueryDto {
  @IsOptional()
  @IsEnum(FULFILLMENT_STATUSES)
  status?: (typeof FULFILLMENT_STATUSES)[number];

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unclaimed?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  overdue?: boolean;

  /** Narrow to one order. What support reaches for when a customer asks. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  orderId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/**
 * Issuing the transfer-market instruction for a coin order.
 *
 * SECURITY: there is no password, email or backup-code field here, and
 * `forbidNonWhitelisted` rejects any that are sent. The delivery mechanism this
 * describes works without them, and a DTO that could carry a credential is one
 * that eventually does.
 */
export class IssueTradeInstructionDto {
  /** The card the customer lists. Public data. */
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  playerName!: string;

  /** Coins to deliver, net of EA's market tax. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500_000_000)
  coins!: number;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  note?: string;
}

/** A customer-facing message. Hebrew is required because the storefront is Hebrew-first. */
export class LocalizedTextDto {
  @IsString()
  @MinLength(3)
  @MaxLength(400)
  he!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  en?: string;
}

export class MarkDeliveredDto {
  /**
   * What was delivered, recorded on the order.
   *
   * Free-form because the shape differs by method: a gift card carries a code,
   * a coin delivery carries the trades that were completed.
   */
  @IsObject()
  payload!: Record<string, unknown>;
}

export class MarkFailedDto {
  @ValidateNested()
  @Type(() => LocalizedTextDto)
  reason!: LocalizedTextDto;
}
