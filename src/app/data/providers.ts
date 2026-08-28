import { Provider } from '@angular/core';
import type { Type } from '@angular/core';
import { HTTP_INTERCEPTORS } from '@angular/common/http';

import { environment } from '../../environments/environment';
import {
  CartApiService, CatalogApiService, CheckoutApiService, CustomerApiService,
  FulfillmentApiService, OrderApiService, PaymentApiService, ProductApiService,
  PromotionApiService, ReviewApiService, SupportApiService,
} from './api';
import { CorrelationInterceptor } from './http';
import {
  HttpCartApiService, HttpCatalogApiService, HttpCheckoutApiService, HttpCustomerApiService,
  HttpFulfillmentApiService, HttpOrderApiService, HttpPaymentApiService, HttpProductApiService,
  HttpPromotionApiService, HttpReviewApiService, HttpSupportApiService,
} from './http';
import {
  MockCartApiService, MockCatalogApiService, MockCheckoutApiService, MockCustomerApiService,
  MockFulfillmentApiService, MockOrderApiService, MockPaymentApiService, MockProductApiService,
  MockPromotionApiService, MockReviewApiService, MockSupportApiService,
} from './mock';

/**
 * The single place where an API abstraction is bound to an implementation.
 *
 * Two complete implementations satisfy the same eleven abstractions:
 *
 * - **mock** — the in-memory backend. Local development and the current public
 *   demo build run on this, so the app is fully usable with no server.
 * - **http** — the REST client for the contract in `docs/API-CONTRACT.md`.
 *
 * `environment.apiMode` chooses between them and nothing else in the application
 * knows which is active. No component, facade, page or domain type references a
 * `Mock*` or `Http*` class; this file is the only importer of either.
 *
 * Deliberately *not* here: any business rule. Pricing, validation, requirement
 * resolution and state transitions live behind the boundary, so the two
 * implementations cannot drift into disagreeing about behaviour.
 */
export function provideDataLayer(): Provider[] {
  return environment.apiMode === 'http' ? httpProviders() : mockProviders();
}

/** Pairs each abstraction with an implementation so the two lists cannot diverge. */
function bind(
  implementations: {
    catalog: Type<CatalogApiService>;
    product: Type<ProductApiService>;
    cart: Type<CartApiService>;
    checkout: Type<CheckoutApiService>;
    payment: Type<PaymentApiService>;
    order: Type<OrderApiService>;
    fulfillment: Type<FulfillmentApiService>;
    customer: Type<CustomerApiService>;
    promotion: Type<PromotionApiService>;
    review: Type<ReviewApiService>;
    support: Type<SupportApiService>;
  },
): Provider[] {
  return [
    { provide: CatalogApiService, useClass: implementations.catalog },
    { provide: ProductApiService, useClass: implementations.product },
    { provide: CartApiService, useClass: implementations.cart },
    { provide: CheckoutApiService, useClass: implementations.checkout },
    { provide: PaymentApiService, useClass: implementations.payment },
    { provide: OrderApiService, useClass: implementations.order },
    { provide: FulfillmentApiService, useClass: implementations.fulfillment },
    { provide: CustomerApiService, useClass: implementations.customer },
    { provide: PromotionApiService, useClass: implementations.promotion },
    { provide: ReviewApiService, useClass: implementations.review },
    { provide: SupportApiService, useClass: implementations.support },
  ];
}

function mockProviders(): Provider[] {
  return bind({
    catalog: MockCatalogApiService,
    product: MockProductApiService,
    cart: MockCartApiService,
    checkout: MockCheckoutApiService,
    payment: MockPaymentApiService,
    order: MockOrderApiService,
    fulfillment: MockFulfillmentApiService,
    customer: MockCustomerApiService,
    promotion: MockPromotionApiService,
    review: MockReviewApiService,
    support: MockSupportApiService,
  });
}

function httpProviders(): Provider[] {
  return [
    ...bind({
      catalog: HttpCatalogApiService,
      product: HttpProductApiService,
      cart: HttpCartApiService,
      checkout: HttpCheckoutApiService,
      payment: HttpPaymentApiService,
      order: HttpOrderApiService,
      fulfillment: HttpFulfillmentApiService,
      customer: HttpCustomerApiService,
      promotion: HttpPromotionApiService,
      review: HttpReviewApiService,
      support: HttpSupportApiService,
    }),
    // Only registered in HTTP mode; there is nothing to correlate in mock mode.
    { provide: HTTP_INTERCEPTORS, useClass: CorrelationInterceptor, multi: true },
  ];
}
