import { LocalizedText, localized } from '../common';

export enum AppErrorKind {
  Api = 'API',
  Validation = 'VALIDATION',
  Payment = 'PAYMENT',
  Fulfillment = 'FULFILLMENT',
  Network = 'NETWORK',
  NotFound = 'NOT_FOUND',
  Unknown = 'UNKNOWN',
}

export interface FieldError {
  readonly field: string;
  readonly message: LocalizedText;
}

/**
 * The single error type the UI ever sees.
 *
 * `userMessage` is the only thing rendered to customers; `technicalMessage` and
 * `cause` are for logging and are never displayed. Nothing here may carry
 * credentials, payment data or provider payloads.
 */
export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly userMessage: LocalizedText;
  readonly technicalMessage: string;
  readonly status?: number;
  readonly code?: string;
  readonly fieldErrors: readonly FieldError[];
  readonly retryable: boolean;

  constructor(init: {
    kind: AppErrorKind;
    userMessage: LocalizedText;
    technicalMessage: string;
    status?: number;
    code?: string;
    fieldErrors?: readonly FieldError[];
    retryable?: boolean;
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
  fieldErrors,
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
  userMessage: localized('אין חיבור לאינטרנט. בדקו את החיבור ונסו שוב.', 'No connection. Check your internet and try again.'),
  technicalMessage,
  retryable: true,
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
