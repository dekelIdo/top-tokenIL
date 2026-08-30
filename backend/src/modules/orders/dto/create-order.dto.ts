import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Creating an order.
 *
 * The whole request. There is no price, quantity, offer or product here, and
 * `forbidNonWhitelisted` rejects any that are sent: what the customer is buying
 * and what it costs were settled when the checkout was opened, and both are read
 * from PostgreSQL.
 */
export class CreateOrderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  checkoutSessionId!: string;
}
