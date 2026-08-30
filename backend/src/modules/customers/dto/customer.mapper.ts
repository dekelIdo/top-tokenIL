import type { Customer } from '@prisma/client';

/** Wire shape, matching `CustomerDto` in the Angular DTO layer. */
export interface CustomerResponse {
  id: string;
  email: string;
  displayName: string | null;
  phone: string | null;
  preferredLocale: string;
  preferredRegion: string;
  createdAt: string;
  emailVerified: boolean;
}

export interface MeResponse {
  authenticated: boolean;
  customer?: CustomerResponse;
}

/**
 * Database row to wire shape.
 *
 * Explicit field by field rather than spreading the row: a spread would ship
 * every column added in future, including ones that should never leave the
 * server.
 */
export function toCustomerResponse(customer: Customer): CustomerResponse {
  return {
    id: customer.id,
    email: customer.email,
    displayName: customer.displayName,
    phone: customer.phone,
    preferredLocale: customer.preferredLocale,
    preferredRegion: customer.preferredRegion,
    createdAt: customer.createdAt.toISOString(),
    emailVerified: customer.emailVerified,
  };
}

export function toMeResponse(customer: Customer | null): MeResponse {
  // Anonymous is a valid answer to "who am I", not an error, so this is a 200
  // with `authenticated: false` rather than a 401.
  return customer
    ? { authenticated: true, customer: toCustomerResponse(customer) }
    : { authenticated: false };
}
