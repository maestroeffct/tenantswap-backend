import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export type VerificationEmailInput = {
  email: string;
  verificationUrl: string;
};

export type EmailDispatchResult = {
  delivered: boolean;
  provider: 'smtp' | 'log-only';
  attempts: number;
  messageId?: string;
  error?: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null;
  private readonly fromAddress: string | null;
  private readonly retryMaxAttempts: number;
  private readonly retryDelayMs: number;

  constructor(private readonly config: ConfigService) {
    const smtpHost = this.config.get<string>('SMTP_HOST');
    const smtpPort = this.config.get<number>('SMTP_PORT') ?? 587;
    const smtpSecure = this.config.get<boolean>('SMTP_SECURE') ?? false;
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');

    this.fromAddress = this.config.get<string>('MAIL_FROM') ?? null;
    this.retryMaxAttempts =
      this.config.get<number>('EMAIL_SEND_RETRY_MAX_ATTEMPTS') ?? 3;
    this.retryDelayMs = this.config.get<number>('EMAIL_SEND_RETRY_DELAY_MS') ?? 750;

    if (smtpHost && smtpUser && smtpPass && this.fromAddress) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      this.logger.log(
        `Email transport enabled via SMTP host=${smtpHost} port=${smtpPort}`,
      );
    } else {
      this.transporter = null;
      this.logger.warn(
        'Email transport is not fully configured. Falling back to log-only verification links.',
      );
    }
  }

  async sendVerificationEmail(
    input: VerificationEmailInput,
  ): Promise<EmailDispatchResult> {
    const subject = 'Verify your TenantSwap email';
    const text = [
      'Welcome to TenantSwap.',
      '',
      'Please verify your email by opening this link:',
      input.verificationUrl,
      '',
      'If you did not request this, please ignore this email.',
    ].join('\n');

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
        <h2 style="margin: 0 0 12px;">Welcome to TenantSwap</h2>
        <p style="margin: 0 0 12px;">Please verify your email to continue.</p>
        <p style="margin: 0 0 18px;">
          <a href="${input.verificationUrl}" style="display:inline-block;padding:10px 16px;background:#0b9f6a;color:#fff;text-decoration:none;border-radius:6px;">Verify Email</a>
        </p>
        <p style="margin: 0 0 6px;">Or copy this link:</p>
        <p style="margin: 0; word-break: break-all;">${input.verificationUrl}</p>
      </div>
    `;

    if (!this.transporter || !this.fromAddress) {
      return {
        delivered: false,
        provider: 'log-only',
        attempts: 0,
        error: 'smtp_not_configured',
      };
    }

    let lastError = 'unknown_error';

    for (let attempt = 1; attempt <= this.retryMaxAttempts; attempt += 1) {
      try {
        const response = await this.transporter.sendMail({
          from: this.fromAddress,
          to: input.email,
          subject,
          text,
          html,
        });

        this.logger.log(
          `[EMAIL_SENT] type=verification email=${input.email} attempt=${attempt} messageId=${response.messageId}`,
        );

        return {
          delivered: true,
          provider: 'smtp',
          attempts: attempt,
          messageId: response.messageId,
        };
      } catch (error: unknown) {
        lastError = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(
          `[EMAIL_SEND_RETRY] type=verification email=${input.email} attempt=${attempt} error="${lastError}"`,
        );

        if (attempt < this.retryMaxAttempts) {
          await this.sleep(this.retryDelayMs * attempt);
        }
      }
    }

    this.logger.error(
      `[EMAIL_SEND_FAILED] type=verification email=${input.email} attempts=${this.retryMaxAttempts} error="${lastError}"`,
    );

    return {
      delivered: false,
      provider: 'smtp',
      attempts: this.retryMaxAttempts,
      error: lastError,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
