import { Observable } from 'rxjs';
import { AddToCartRequest, Cart, CartItem, CartValidationResult, CouponApplication } from '../../domain';

/**
 * The cart is validated server-side. `validate` re-prices every line against the
 * catalog and is the only thing allowed to determine what a customer pays — the
 * locally cached prices exist purely so the cart can render offline.
 */
export abstract class CartApiService {
  /**
   * Builds a cart line from an offer id. The server owns this, not the UI, so a
   * component never has to assemble a price or a display name by hand.
   */
  abstract createItem(request: AddToCartRequest): Observable<CartItem>;
  abstract validate(cart: Cart): Observable<CartValidationResult>;
  abstract applyCoupon(cart: Cart, code: string): Observable<CouponApplication>;
}
