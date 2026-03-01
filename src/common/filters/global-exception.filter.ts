import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type ErrorMeta = Record<string, unknown>;

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let details: string[] | undefined;
    let meta: ErrorMeta | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse) {
        const payload = exceptionResponse as Record<string, unknown>;
        const rawMessage = payload.message;

        if (Array.isArray(rawMessage)) {
          details = rawMessage.filter(
            (item): item is string => typeof item === 'string',
          );
          message =
            statusCode === HttpStatus.BAD_REQUEST
              ? 'Invalid request payload'
              : (details[0] ?? 'Request failed');
        } else if (typeof rawMessage === 'string') {
          message = rawMessage;
        } else if (typeof payload.error === 'string') {
          message = payload.error;
        }

        const rawMeta = payload.meta;
        if (rawMeta && typeof rawMeta === 'object' && !Array.isArray(rawMeta)) {
          meta = rawMeta as ErrorMeta;
        }
      }

      if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
        message = 'Internal server error';
      }

      if (statusCode >= HttpStatus.BAD_REQUEST) {
        this.logger.warn(
          JSON.stringify({
            event: 'http_exception',
            statusCode,
            method: request.method,
            path: request.url,
            ip: request.ip,
            message,
            ...(meta ? { meta } : {}),
          }),
        );
      }
    } else {
      this.logger.error('Unhandled exception', exception as Error);
    }

    const data: Record<string, unknown> = {};
    if (meta) {
      data.meta = meta;
    }
    if (details && statusCode === HttpStatus.BAD_REQUEST) {
      data.errors = details;
    }

    response.status(statusCode).json({
      statusCode,
      message,
      data: Object.keys(data).length > 0 ? data : null,
    });
  }
}
