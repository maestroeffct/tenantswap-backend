import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { map, Observable } from 'rxjs';

type Envelope = {
  statusCode: number;
  message: string;
  data: unknown;
};

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Envelope> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((body: unknown) => this.toEnvelope(body, response.statusCode)),
    );
  }

  private toEnvelope(body: unknown, statusCode: number): Envelope {
    const fallbackMessage = this.defaultMessage(statusCode);

    if (this.isRecord(body)) {
      if (
        typeof body.statusCode === 'number' &&
        typeof body.message === 'string' &&
        'data' in body
      ) {
        return {
          statusCode: body.statusCode,
          message: body.message,
          data: body.data ?? null,
        };
      }

      const message =
        typeof body.message === 'string' ? body.message : fallbackMessage;

      if ('data' in body) {
        return {
          statusCode,
          message,
          data: body.data ?? null,
        };
      }

      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(body)) {
        if (key === 'message' || key === 'success' || key === 'statusCode') {
          continue;
        }
        payload[key] = value;
      }

      return {
        statusCode,
        message,
        data: Object.keys(payload).length > 0 ? payload : null,
      };
    }

    return {
      statusCode,
      message: fallbackMessage,
      data: body ?? null,
    };
  }

  private defaultMessage(statusCode: number): string {
    if (statusCode === HttpStatus.CREATED) {
      return 'Resource created successfully';
    }

    if (statusCode === HttpStatus.NO_CONTENT) {
      return 'Request completed successfully';
    }

    return 'Request successful';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
