/**
 * The complete analytics vocabulary. Adding an event means adding a member here,
 * so every tracked interaction is visible in one file.
 */
export enum AnalyticsEvent {
  PageView = 'page_view',
  ProductView = 'product_view',
  ProductSelected = 'product_selected',
  AddToCart = 'add_to_cart',
  RemoveFromCart = 'remove_from_cart',
  BeginCheckout = 'begin_checkout',
  CheckoutValidationError = 'checkout_validation_error',
  PaymentStarted = 'payment_started',
  PaymentSuccess = 'payment_success',
  PaymentFailed = 'payment_failed',
  OrderCreated = 'order_created',
  OrderCompleted = 'order_completed',
  SupportOpened = 'support_opened',
}

/** Analytics payloads are flat and primitive by construction. */
export type AnalyticsPayload = Readonly<Record<string, string | number | boolean>>;
