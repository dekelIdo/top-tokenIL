import { LocalizedText, localized } from '../common';

export enum AppErrorKind {
  /** A 4xx/5xx the UI has no more specific handling for. */
  Api = 'API',
  /** 400/422 — the submitted data was rejected; `fieldErrors` says where. */
  Validation = 'VALIDATION',
  /** 401 — no valid session. The UI should offer to sign in again. */
  Unauthorized = 'UNAUTHORIZED',
  /** 403 — authenticated but not allowed to touch this resource. */
  Forbidden = 'FORBIDDEN',
  /** 404 — the resource does not exist, or is not visible to this caller. */
  NotFound = 'NOT_FOUND',
  /** 409 — the request conflicts with current state (already paid, stale cart). */
  Conflict = 'CONFLICT',
  /** 429 — rate limited. `retryAfterSeconds` says how long to wait. */
  RateLimited = 'RATE_LIMITED',
  /** Payment-specific failure, including a declined charge. */
  Payment = 'PAYMENT',
  /** Fulfillment could not be completed. */
  Fulfillment = 'FULFILLMENT',
  /** The request never reached the server, or timed out. */
  Network = 'NETWORK',
  /** 5xx — the backend is broken or unavailable. */
  Server = 'SERVER',
  Unknown = 'UNKNOWN',
}

export interface FieldError {
  readonly field: string;
  readonly message: LocalizedText;
}

/**
 * The single error type the UI ever sees.
 *
 * `userMessage` is the only thing rendered to customers; `technicalMessage`,
 * `code` and `correlationId` are for logs and support. Nothing here may carry
 * credentials, payment data or a raw provider payload.
 */
export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly userMessage: LocalizedText;
  readonly technicalMessage: string;
  readonly status?: number;
  readonly code?: string;
  readonly fieldErrors: readonly FieldError[];
  readonly retryable: boolean;
  /** Seconds to wait before retrying, from `Retry-After` on a 429/503. */
  readonly retryAfterSeconds?: number;
  /** Server-issued request id, so a customer report can be traced in the logs. */
  readonly correlationId?: string;

  constructor(init: {
    kind: AppErrorKind;
    userMessage: LocalizedText;
    technicalMessage: string;
    status?: number;
    code?: string;
    fieldErrors?: readonly FieldError[];
    retryable?: boolean;
    retryAfterSeconds?: number;
    correlationId?: string;
  }) {
    super(init.technicalMessage);
    this.name = 'AppError';
    this.kind = init.kind;
    this.userMessage = init.userMessage;
    this.technicalMessage = init.technicalMessage;
    this.status = init.status;
    this.code = init.code;
    this.fieldErrors = init.fieldErrors ?? [];
    this.retryable = init.retryable ?? false;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.correlationId = init.correlationId;
  }
}

export const apiError = (technicalMessage: string, status?: number): AppError => new AppError({
  kind: AppErrorKind.Api,
  userMessage: localized('אירעה שגיאה בשירות. אנא נסו שוב בעוד רגע.', 'Something went wrong on our side. Please try again shortly.'),
  technicalMessage,
  status,
  retryable: true,
});

export const validationError = (technicalMessage: string, fieldErrors: readonly FieldError[] = []): AppError => new AppError({
  kind: AppErrorKind.Validation,
  userMessage: localized('חלק מהפרטים אינם תקינים. בדקו את השדות המסומנים.', 'Some details are invalid. Please check the highlighted fields.'),
  technicalMessage,
  status: 422,
  fieldErrors,
});

export const unauthorizedError = (technicalMessage: string): AppError => new AppError({
  kind: AppErrorKind.Unauthorized,
  userMessage: localized('החיבור פג. אנא היכנסו שוב כדי להמשיך.', 'Your session has expired. Please sign in again to continue.'),
  technicalMessage,
  status: 401,
});

export const forbiddenError = (technicalMessage: string): AppError => new AppError({
  kind: AppErrorKind.Forbidden,
  userMessage: localized('אין לכם הרשאה לצפות בפריט הזה.', 'You do not have permission to view this item.'),
  technicalMessage,
  status: 403,
});

export const conflictError = (technicalMessage: string, userMessage?: LocalizedText): AppError => new AppError({
  kind: AppErrorKind.Conflict,
  userMessage: userMessage ?? localized(
    'משהו השתנה מאז שהתחלתם. רעננו את הדף ונסו שוב.',
    'Something changed since you started. Refresh the page and try again.',
  ),
  technicalMessage,
  status: 409,
});

export const rateLimitedError = (technicalMessage: string, retryAfterSeconds?: number): AppError => new AppError({
  kind: AppErrorKind.RateLimited,
  userMessage: retryAfterSeconds
    ? localized(
      `יותר מדי ניסיונות. אפשר לנסות שוב בעוד ${retryAfterSeconds} שניות.`,
      `Too many attempts. You can try again in ${retryAfterSeconds} seconds.`,
    )
    : localized('יותר מדי ניסיונות. אנא המתינו רגע ונסו שוב.', 'Too many attempts. Please wait a moment and try again.'),
  technicalMessage,
  status: 429,
  retryable: true,
  retryAfterSeconds,
});

export const paymentError = (technicalMessage: string, userMessage?: LocalizedText): AppError => new AppError({
  kind: AppErrorKind.Payment,
  userMessage: userMessage ?? localized('התשלום לא הושלם. לא חויבתם. אפשר לנסות שוב או לבחור אמצעי תשלום אחר.', 'The payment did not go through. You were not charged. Try again or use another payment method.'),
  technicalMessage,
  retryable: true,
});

export const fulfillmentError = (technicalMessage: string): AppError => new AppError({
  kind: AppErrorKind.Fulfillment,
  userMessage: localized('הייתה תקלה באספקת ההזמנה. צוות התמיכה שלנו כבר מטפל בכך.', 'There was a problem delivering your order. Our support team is on it.'),
  technicalMessage,
});

export const networkError = (technicalMessage: string): AppError => new AppError({
  kind: AppErrorKind.Network,
  userMessage: localized('אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.', 'Cannot reach the server. Check your connection and try again.'),
  technicalMessage,
  retryable: true,
});

export const serverError = (technicalMessage: string, status = 500, retryAfterSeconds?: number): AppError => new AppError({
  kind: AppErrorKind.Server,
  userMessage: localized(
    'השירות אינו זמין כרגע. אנחנו כבר מטפלים בזה. נסו שוב בעוד רגע.',
    'The service is unavailable right now. We are on it. Please try again shortly.',
  ),
  technicalMessage,
  status,
  retryable: true,
  retryAfterSeconds,
});

export const notFoundError = (technicalMessage: string): AppError => new AppError({
  kind: AppErrorKind.NotFound,
  userMessage: localized('הפריט המבוקש לא נמצא.', 'We could not find what you were looking for.'),
  technicalMessage,
  status: 404,
});

export const unknownError = (technicalMessage: string): AppError => new AppError({
  kind: AppErrorKind.Unknown,
  userMessage: localized('אירעה שגיאה בלתי צפויה. אנא נסו שוב.', 'An unexpected error occurred. Please try again.'),
  technicalMessage,
  retryable: true,
});

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Normalises anything thrown anywhere in the app into an AppError. */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) {
    return value;
  }
  if (value instanceof Error) {
    return unknownError(value.message);
  }
  return unknownError(String(value));
}
