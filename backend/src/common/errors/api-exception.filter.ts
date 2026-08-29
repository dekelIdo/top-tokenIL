import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AppLogger } from '../logging/app-logger.service';
import {
  ApiError,
  ApiErrorKind,
  ApiFieldError,
  badRequestError,
  forbiddenError,
  isApiError,
  notFoundError,
  payloadTooLargeError,
  serverError,
  unauthorizedError,
  validationError,
} from './api-error';

/**
 * The single exit point for every failure.
 *
 * Nothing reaches a customer except through here, which is what makes "no stack
 * traces, no database errors, no internal detail" enforceable rather than
 * aspirational. Nest's own error shapes (`{statusCode, message, error}`) are
 * translated into our contract so the frontend never sees a framework format.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const correlationId = (request as Request & { correlationId?: string }).correlationId;

    const error = this.normalise(exception);

    // The technical message goes to the log; the customer gets userMessage.
    const context = {
      requestId: correlationId,
      method: request.method,
      path: request.originalUrl,
      status: error.status,
      kind: error.kind,
      code: error.code,
    };

    if (error.status >= 500) {
      this.logger.error(error.message, {
        ...context,
        // A stack is kept for us, never serialised into the response.
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    } else {
      this.logger.warn(error.message, context);
    }

    if (error.retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(error.retryAfterSeconds));
    }

    response.status(error.status).json(error.toBody(correlationId));
  }

  /** Anything thrown anywhere becomes exactly one ApiError. */
  private normalise(exception: unknown): ApiError {
    if (isApiError(exception)) {
      return exception;
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    // Express middleware errors (body-parser, cookie-parser) are plain Errors
    // carrying a numeric status. They never reach a controller, so Nest does
    // not wrap them, and without this branch a 413 would be reported as a 500.
    const expressStatus = this.statusOf(exception);
    if (expressStatus !== undefined) {
      const detail = exception instanceof Error ? exception.message : String(exception);
      if (expressStatus === 413) {
        return payloadTooLargeError(detail);
      }
      if (expressStatus === 400) {
        return badRequestError(detail, 'MALFORMED_REQUEST');
      }
    }

    // An unrecognised throw is a bug. Log the detail, tell the customer nothing.
    const message = exception instanceof Error ? exception.message : String(exception);
    return serverError(`Unhandled exception: ${message}`);
  }

  /** Reads the status an Express-layer error carries, if any. */
  private statusOf(exception: unknown): number | undefined {
    if (typeof exception !== 'object' || exception === null) {
      return undefined;
    }
    const candidate = exception as { status?: unknown; statusCode?: unknown };
    const status = candidate.status ?? candidate.statusCode;
    return typeof status === 'number' ? status : undefined;
  }

  private fromHttpException(exception: HttpException): ApiError {
    const status = exception.getStatus();
    const payload = exception.getResponse();
    const detail = this.describe(payload);

    switch (status) {
      case HttpStatus.BAD_REQUEST:
        // Nest's ValidationPipe throws 400 with a string array of messages.
        return this.fromValidationPayload(payload, detail);
      case HttpStatus.UNAUTHORIZED:
        return unauthorizedError(detail);
      case HttpStatus.FORBIDDEN:
        return forbiddenError(detail);
      case HttpStatus.NOT_FOUND:
        return notFoundError(detail);
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return badRequestError(detail, 'PAYLOAD_TOO_LARGE');
      default:
        if (status >= 500) {
          return serverError(detail);
        }
        return new ApiError({
          kind: ApiErrorKind.Api,
          status,
          code: 'REQUEST_FAILED',
          message: detail,
          userMessage: {
            he: 'אירעה שגיאה בשירות. נסו שוב בעוד רגע.',
            en: 'Something went wrong on our side. Please try again shortly.',
          },
          retryable: status >= 500,
        });
    }
  }

  /**
   * Turns `ValidationPipe`'s message array into typed field errors, so the UI
   * can mark the offending control rather than showing a wall of text.
   */
  private fromValidationPayload(payload: unknown, detail: string): ApiError {
    const messages = this.messagesOf(payload);
    if (messages.length === 0) {
      return badRequestError(detail);
    }

    const fieldErrors: ApiFieldError[] = messages.map((raw) => {
      const field = raw.split(' ')[0] ?? 'request';
      return {
        field,
        message: {
          he: 'הערך אינו תקין.',
          en: raw,
        },
      };
    });

    return validationError(detail, fieldErrors);
  }

  private messagesOf(payload: unknown): string[] {
    if (typeof payload === 'object' && payload !== null && 'message' in payload) {
      const message = (payload as { message: unknown }).message;
      if (Array.isArray(message)) {
        return message.filter((entry): entry is string => typeof entry === 'string');
      }
    }
    return [];
  }

  private describe(payload: unknown): string {
    if (typeof payload === 'string') {
      return payload;
    }
    if (typeof payload === 'object' && payload !== null && 'message' in payload) {
      const message = (payload as { message: unknown }).message;
      if (typeof message === 'string') {
        return message;
      }
      if (Array.isArray(message)) {
        return message.join('; ');
      }
    }
    return 'Request failed';
  }
}
