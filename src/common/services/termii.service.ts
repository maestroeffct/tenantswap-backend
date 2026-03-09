import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SendPhoneOtpInput = {
  phone: string;
};

export type SendPhoneOtpResult = {
  pinId: string;
  expiresAt: Date;
  providerStatus: string;
};

export type VerifyPhoneOtpInput = {
  pinId: string;
  pin: string;
};

export type VerifyPhoneOtpResult = {
  verified: boolean;
  providerStatus: string;
};

@Injectable()
export class TermiiService {
  private readonly logger = new Logger(TermiiService.name);

  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly senderId: string;
  private readonly channel: string;
  private readonly pinAttempts: number;
  private readonly pinTtlMinutes: number;
  private readonly pinLength: number;
  private readonly pinType: string;
  private readonly requestTimeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('TERMII_API_KEY');
    this.baseUrl =
      this.config.get<string>('TERMII_BASE_URL') ?? 'https://api.ng.termii.com';
    this.senderId = this.config.get<string>('TERMII_SENDER_ID') ?? 'TenantSwap';
    this.channel = this.config.get<string>('TERMII_CHANNEL') ?? 'dnd';
    this.pinAttempts = this.config.get<number>('TERMII_PIN_ATTEMPTS') ?? 5;
    this.pinTtlMinutes =
      this.config.get<number>('TERMII_PIN_TTL_MINUTES') ?? 10;
    this.pinLength = this.config.get<number>('TERMII_PIN_LENGTH') ?? 6;
    this.pinType = this.config.get<string>('TERMII_PIN_TYPE') ?? 'NUMERIC';
    this.requestTimeoutMs =
      this.config.get<number>('TERMII_REQUEST_TIMEOUT_MS') ?? 10_000;
  }

  async sendOtp(input: SendPhoneOtpInput): Promise<SendPhoneOtpResult> {
    this.assertConfigured();

    const payload = {
      api_key: this.apiKey,
      message_type: 'NUMERIC',
      to: input.phone,
      from: this.senderId,
      channel: this.channel,
      pin_attempts: this.pinAttempts,
      pin_time_to_live: this.pinTtlMinutes,
      pin_length: this.pinLength,
      pin_placeholder: '< 1234 >',
      message_text: `Your TenantSwap verification code is < 1234 >. Expires in ${this.pinTtlMinutes} minutes.`,
      pin_type: this.pinType,
    };

    const response = await this.post('/api/sms/otp/send', payload);

    const pinIdValue = response.pinId ?? response.pin_id;
    if (typeof pinIdValue !== 'string' || !pinIdValue.trim()) {
      this.logger.error(
        `[TERMII_SEND_INVALID_RESPONSE] phone=${input.phone} response=${JSON.stringify(response)}`,
      );
      throw new BadGatewayException('Unable to initiate phone verification');
    }

    return {
      pinId: pinIdValue,
      expiresAt: new Date(Date.now() + this.pinTtlMinutes * 60_000),
      providerStatus:
        typeof response.message === 'string' ? response.message : 'OTP_SENT',
    };
  }

  async verifyOtp(input: VerifyPhoneOtpInput): Promise<VerifyPhoneOtpResult> {
    this.assertConfigured();

    const payload = {
      api_key: this.apiKey,
      pin_id: input.pinId,
      pin: input.pin,
    };

    const response = await this.post('/api/sms/otp/verify', payload);

    const status =
      typeof response.status === 'string'
        ? response.status.trim().toLowerCase()
        : undefined;
    const verifiedValue =
      typeof response.verified === 'string'
        ? response.verified.trim().toLowerCase()
        : response.verified;

    const verified =
      verifiedValue === true ||
      verifiedValue === 'true' ||
      status === 'verified' ||
      status === 'success' ||
      status === 'successful';

    return {
      verified,
      providerStatus:
        typeof response.message === 'string'
          ? response.message
          : typeof response.status === 'string'
            ? response.status
            : verified
              ? 'VERIFIED'
              : 'NOT_VERIFIED',
    };
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'Phone verification is not configured',
      );
    }
  }

  private async post(path: string, payload: Record<string, unknown>) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const body = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (!response.ok) {
        this.logger.warn(
          `[TERMII_HTTP_ERROR] status=${response.status} path=${path} body=${JSON.stringify(body)}`,
        );
        throw new BadGatewayException('Phone verification provider error');
      }

      return body;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown_error';

      if (message.includes('aborted')) {
        throw new ServiceUnavailableException(
          'Phone verification request timed out',
        );
      }

      if (error instanceof BadGatewayException) {
        throw error;
      }

      this.logger.error(
        `[TERMII_REQUEST_FAILED] path=${path} error="${message}"`,
      );
      throw new ServiceUnavailableException(
        'Phone verification is currently unavailable',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
