import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@xgcanvas/shared-types';
import { redactSecretLikeValues, redactSecretText } from '@xgcanvas/model-catalog';
import type { Request, Response } from 'express';

interface ApiErrorBody {
  ok: false;
  error: { code: ErrorCode; message: string; details?: unknown; request_id?: string };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(ex: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, body } = this.shape(ex);
    // Prefer an invoke-level request id (vendor call) if present, else the HTTP request id.
    body.error.request_id =
      (ex as { request_id?: string }).request_id ?? (req as Request & { id?: string }).id;
    if (status >= 500) {
      this.logger.error(`${req.method} ${req.path} -> ${status} [req ${body.error.request_id}]`);
    }
    res.status(status).json(body);
  }

  private shape(ex: unknown): { status: number; body: ApiErrorBody } {
    if (ex instanceof HttpException) {
      const status = ex.getStatus();
      const r = ex.getResponse() as
        | { code?: ErrorCode; message?: string | string[]; details?: unknown }
        | string;
      const message = redactSecretText(
        typeof r === 'string'
          ? r
          : Array.isArray(r.message)
            ? r.message.join('; ')
            : (r.message ?? ex.message),
      );
      const code = typeof r === 'object' && r.code ? r.code : this.codeFromStatus(status);
      return {
        status,
        body: {
          ok: false,
          error: {
            code,
            message,
            details: typeof r === 'object' ? redactSecretLikeValues(r.details) : undefined,
          },
        },
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        ok: false,
        error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'internal error' },
      },
    };
  }

  private codeFromStatus(s: number): ErrorCode {
    if (s === 400) return ERROR_CODES.VALIDATION_FAILED;
    if (s === 401) return ERROR_CODES.UNAUTHORIZED;
    if (s === 403) return ERROR_CODES.FORBIDDEN;
    if (s === 404) return ERROR_CODES.NOT_FOUND;
    if (s === 409) return ERROR_CODES.CONFLICT;
    if (s === 413) return ERROR_CODES.PAYLOAD_TOO_LARGE;
    if (s === 429) return ERROR_CODES.RATE_LIMITED;
    return ERROR_CODES.INTERNAL_ERROR;
  }
}
