import { Provider } from '@angular/core';

import { environment } from '../../environments/environment';
import {
  CartApiService, CatalogApiService, CheckoutApiService, CustomerApiService,
  FulfillmentApiService, OrderApiService, PaymentApiService, ProductApiService,
  PromotionApiService, ReviewApiService, SupportApiService,
} from './api';
import {
  MockCartApiService, MockCatalogApiService, MockCheckoutApiService, MockCustomerApiService,
  MockFulfillmentApiService, MockOrderApiService, MockPaymentApiService, MockProductApiService,
  MockPromotionApiService, MockReviewApiService, MockSupportApiService,
} from './mock';

/**
 * The single place where an API abstraction is bound to an implementation.
 *
 * Swapping the mock backend for a real one is an edit to this file: write the
 * HTTP implementations, bind them here, and no component, facade or template
 * changes. Nothing else in the application may reference a Mock* class.
 */
export function provideDataLayer(): Provider[] {
  if (!environment.mockApiEnabled) {
    // Deliberately explicit: there is no HTTP implementation yet, and the app must
    // never quietly render an empty store while looking like it talks to a server.
    throw new Error(
      'mockApiEnabled is false but no HTTP API implementation is bound. '
      + 'Implement the Http*ApiService classes and bind them in data/providers.ts.',
    );
  }

  return [
    { provide: CatalogApiService, useClass: MockCatalogApiService },
    { provide: ProductApiService, useClass: MockProductApiService },
    { provide: CartApiService, useClass: MockCartApiService },
    { provide: CheckoutApiService, useClass: MockCheckoutApiService },
    { provide: PaymentApiService, useClass: MockPaymentApiService },
    { provide: OrderApiService, useClass: MockOrderApiService },
    { provide: FulfillmentApiService, useClass: MockFulfillmentApiService },
    { provide: CustomerApiService, useClass: MockCustomerApiService },
    { provide: PromotionApiService, useClass: MockPromotionApiService },
    { provide: ReviewApiService, useClass: MockReviewApiService },
    { provide: SupportApiService, useClass: MockSupportApiService },
  ];
}
