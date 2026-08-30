import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { AddCartItemDto, CartRequestDto, ValidateCouponDto } from './dto/cart.dto';
import { toCartItemDto, toCartValidationDto } from './dto/cart.mapper';
import { PricingService } from './pricing.service';

/**
 * The cart.
 *
 * The cart itself lives in the browser as a list of offer ids and quantities,
 * which is what lets it survive a reload without a round trip and without an
 * account. Nothing financial is stored there: every price on screen came from
 * one of these endpoints, and is recomputed by them before anything is charged.
 *
 * There is no cart resource to address, so there is no cart to read out of
 * someone else's session. The absence is the security property.
 */
@Controller()
export class CartController {
  constructor(private readonly pricing: PricingService) {}

  /**
   * Prices one line for the cart.
   *
   * Returns 201 with the priced line, or a business error the customer can act
   * on: sold out, quantity too high, no longer sold.
   */
  @Post('cart/items')
  @HttpCode(HttpStatus.CREATED)
  async addItem(@Body() body: AddCartItemDto) {
    const line = await this.pricing.priceLine({
      offerId: body.offerId,
      quantity: body.quantity,
    });
    return toCartItemDto(line);
  }

  /**
   * Re-prices the whole cart against current catalog state.
   *
   * Called before checkout and whenever the cart is restored from storage, so a
   * price change, a sold-out item or a withdrawn product is caught before the
   * customer reaches payment rather than after.
   */
  @Post('cart/validate')
  @HttpCode(HttpStatus.OK)
  async validate(@Body() body: CartRequestDto) {
    const cart = await this.pricing.priceCart(body.items, { couponCode: body.couponCode });
    return toCartValidationDto(cart, body.couponCode ?? null);
  }

  /**
   * Checks a coupon against a cart.
   *
   * The discount is resolved from the promotion row, never from the request, so
   * an unknown or expired code is simply worth nothing.
   */
  @Post('promotions/validate')
  @HttpCode(HttpStatus.OK)
  async validateCoupon(@Body() body: ValidateCouponDto) {
    const cart = await this.pricing.priceCart(body.items, { couponCode: body.code });
    const applied = cart.discountMinor > 0;

    return {
      applied,
      code: body.code,
      discount: { amountMinor: cart.discountMinor, currency: cart.currency },
      message: applied
        ? {
            he: 'הקוד הופעל על העגלה.',
            en: 'The code was applied to your cart.',
          }
        : {
            he: 'הקוד אינו תקף.',
            en: 'That code is not valid.',
          },
    };
  }
}
