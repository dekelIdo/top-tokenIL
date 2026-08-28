import { HttpErrorResponse } from '@angular/common/http';

import {
  AppError, AppErrorKind, FieldError, LocalizedText, apiError, conflictError, forbiddenError,
  localized, networkError, notFoundError, paymentError, rateLimitedError, serverError,
  unauthorizedError, validationError,
} from '../../domain';

/**
 * The error envelope every endpoint returns for a non-2xx response.
 * Specified in docs/API-CONTRACT.md; mirrored here as the wire type.
 */
export interface ApiErrorDto {
  readonly kind?: string;
  readonly code?: string;
  readonly message?: string;
  readonly userMessage?: { readonly he?: string; readonly en?: string };
  readonly fieldErrors?: readonly {
    readonly field?: string;
    readonly message?: { readonly he?: string; readonly en?: string };
  }[];
  readonly retryable?: boolean;
  readonly correlationId?: string;
}

/**
 * Turns anything the transport can produce into exactly one `AppError`.
 *
 * Two rules govern this file:
 *
 * 1. **The status code decides the kind.** A backend that forgets to set a
 *    `kind` still produces a correctly classified error.
 * 2. **The server's `userMessage` wins when present, otherwise we supply one.**
 *    A raw `message`, stack trace or provider payload is never promoted into
 *    customer-facing text — it stays in `technicalMessage` for the logs.
 */
export function mapHttpError(error: unknown): AppError {
  if (!(error instanceof HttpErrorResponse)) {
    return error instanceof Error
      ? apiError(error.message)
      : apiError(String(error));
  }

  const body = extractBody(error);
  const correlationId = body?.correlationId ?? error.headers?.get('X-Request-Id') ?? undefined;
  const technical = `${error.status} ${error.statusText} ${describe(error)} ${body?.message ?? ''}`.trim();
  const serverMessage = toLocalizedText(body?.userMessage);
  const fieldErrors = mapFieldErrors(body);
  const retryAfter = parseRetryAfter(error.headers?.get('Retry-After'));

  // status 0 means the request never completed: offline, DNS failure, CORS
  // rejection or a timeout we aborted ourselves.
  if (error.status === 0) {
    return withContext(networkError(technical || 'Request did not reach the server'), correlationId);
  }

  const base = classify(error.status, technical, serverMessage, fieldErrors, retryAfter, body);
  return withContext(base, correlationId);
}

function classify(
  status: number,
  technical: string,
  serverMessage: LocalizedText | undefined,
  fieldErrors: readonly FieldError[],
  retryAfter: number | undefined,
  body: ApiErrorDto | undefined,
): AppError {
  switch (status) {
    case 400:
    case 422:
      return override(validationError(technical, fieldErrors), serverMessage, body?.code);
    case 401:
      return override(unauthorizedError(technical), serverMessage, body?.code);
    case 403:
      return override(forbiddenError(technical), serverMessage, body?.code);
    case 404:
      return override(notFoundError(technical), serverMessage, body?.code);
    case 409:
      return override(conflictError(technical, serverMessage), serverMessage, body?.code);
    case 402:
      return override(paymentError(technical, serverMessage), serverMessage, body?.code);
    case 429:
      return override(rateLimitedError(technical, retryAfter), serverMessage, body?.code);
    case 500:
    case 502:
    case 503:
    case 504:
      return override(serverError(technical, status, retryAfter), serverMessage, body?.code);
    default:
      if (status >= 500) {
        return override(serverError(technical, status, retryAfter), serverMessage, body?.code);
      }
      return override(apiError(technical, status), serverMessage, body?.code);
  }
}

/** Re-creates the error with the server's own wording and code when supplied. */
function override(error: AppError, userMessage: LocalizedText | undefined, code: string | undefined): AppError {
  if (!userMessage && !code) {
    return error;
  }
  return new AppError({
    kind: error.kind,
    userMessage: userMessage ?? error.userMessage,
    technicalMessage: error.technicalMessage,
    status: error.status,
    code: code ?? error.code,
    fieldErrors: error.fieldErrors,
    retryable: error.retryable,
    retryAfterSeconds: error.retryAfterSeconds,
  });
}

function withContext(error: AppError, correlationId: string | undefined): AppError {
  if (!correlationId) {
    return error;
  }
  return new AppError({
    kind: error.kind,
    userMessage: error.userMessage,
    technicalMessage: error.technicalMessage,
    status: error.status,
    code: error.code,
    fieldErrors: error.fieldErrors,
    retryable: error.retryable,
    retryAfterSeconds: error.retryAfterSeconds,
    correlationId,
  });
}

function extractBody(error: HttpErrorResponse): ApiErrorDto | undefined {
  const body: unknown = error.error;
  if (body && typeof body === 'object' && !(body instanceof ProgressEvent)) {
    return body as ApiErrorDto;
  }
  return undefined;
}

function describe(error: HttpErrorResponse): string {
  // The URL is safe to log; query strings never carry secrets by contract.
  return error.url ? `(${error.url})` : '';
}

function toLocalizedText(value: ApiErrorDto['userMessage']): LocalizedText | undefined {
  if (!value || typeof value.he !== 'string' || value.he.trim().length === 0) {
    return undefined;
  }
  return typeof value.en === 'string' ? localized(value.he, value.en) : localized(value.he);
}

function mapFieldErrors(body: ApiErrorDto | undefined): readonly FieldError[] {
  if (!Array.isArray(body?.fieldErrors)) {
    return [];
  }
  return body!.fieldErrors
    .map((entry) => {
      const message = toLocalizedText(entry.message);
      return entry.field && message ? { field: entry.field, message } : undefined;
    })
    .filter((entry): entry is FieldError => entry !== undefined);
}

/** `Retry-After` is either delta-seconds or an HTTP date. */
function parseRetryAfter(header: string | null | undefined): number | undefined {
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds);
  }
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }
  return undefined;
}

/** True for errors where a blind retry is safe and likely to help. */
export function isTransient(error: AppError): boolean {
  return error.kind === AppErrorKind.Network
    || error.kind === AppErrorKind.Server
    || error.kind === AppErrorKind.RateLimited;
}
