import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import VerifyEmail from 'emails/VerifyEmail';
import MatchEmail from 'emails/MatchEmail';
import { render } from '@react-email/components';
import React from 'react';
import * as https from 'https';
import * as querystring from 'querystring';
import { PrismaService } from '../prisma.service';

export type VerificationEmailInput = {
  fullName: string;
  email: string;
  verificationUrl: string;

};

export type SystemEmailInput = {
  email: string;
  subject: string;
  title: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
};

export type AdminTemplateEmailInput = {
  email: string;
  subject: string;
  html: string;
  text: string;
  recipientUserId?: string;
  templateSlug?: string;
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
  private readonly mailgunApiKey: string | null;
  private readonly mailgunDomain: string | null;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    const smtpHost = this.config.get<string>('SMTP_HOST');
    const smtpPort = this.config.get<number>('SMTP_PORT') ?? 587;
    const smtpSecure = this.config.get<boolean>('SMTP_SECURE') ?? false;
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');

    this.fromAddress = this.config.get<string>('MAIL_FROM') ?? null;
    this.retryMaxAttempts =
      this.config.get<number>('EMAIL_SEND_RETRY_MAX_ATTEMPTS') ?? 3;
    this.retryDelayMs =
      this.config.get<number>('EMAIL_SEND_RETRY_DELAY_MS') ?? 750;

    this.mailgunApiKey = this.config.get<string>('MAILGUN_API_KEY') ?? null;
    this.mailgunDomain = this.config.get<string>('MAILGUN_DOMAIN') ?? null;

    if (this.mailgunApiKey && this.mailgunDomain) {
      this.transporter = null;
      this.logger.log(
        `Email transport enabled via Mailgun HTTP API domain=${this.mailgunDomain}`,
      );
    } else if (smtpHost && smtpUser && smtpPass && this.fromAddress) {
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

  private sendViaMailgunApi(input: {
    to: string;
    from: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<string> {
    return new Promise((resolve, reject) => {
      const postData = querystring.stringify({
        from: input.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });

      const options: https.RequestOptions = {
        hostname: 'api.mailgun.net',
        path: `/v3/${this.mailgunDomain}/messages`,
        method: 'POST',
        auth: `api:${this.mailgunApiKey}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(body) as { id?: string };
              resolve(parsed.id ?? 'mailgun-ok');
            } catch {
              resolve('mailgun-ok');
            }
          } else {
            reject(new Error(`Mailgun API error ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
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

    // const html = `
    //   <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
    //     <h2 style="margin: 0 0 12px;">Welcome to TenantSwap</h2>
    //     <p style="margin: 0 0 12px;">Please verify your email to continue.</p>
    //     <p style="margin: 0 0 18px;">
    //       <a href="${input.verificationUrl}" style="display:inline-block;padding:10px 16px;background:#0b9f6a;color:#fff;text-decoration:none;border-radius:6px;">Verify Email</a>
    //     </p>
    //     <p style="margin: 0 0 6px;">Or copy this link:</p>
    //     <p style="margin: 0; word-break: break-all;">${input.verificationUrl}</p>
    //   </div>
    // `;

const template = React.createElement(VerifyEmail, {
  fullName:input.fullName,
  verificationUrl:input.verificationUrl,
  appUrl:this.config.get<string>('FRONTEND_URL') as string});

    const html = await render(template);

    return this.dispatchEmail({
      type: 'verification',
      to: input.email,
      subject,
      text,
      html,
    });
  }

  async sendSystemEmail(input: SystemEmailInput): Promise<EmailDispatchResult> {
    const textLines = [input.title, '', input.message];
    if (input.actionUrl) {
      textLines.push('', input.actionUrl);
    }

    const frontendUrl = this.config.get<string>('FRONTEND_URL') as string;
    const supportEmail = this.config.get<string>('SUPPORT_EMAIL') ?? "support@tenantswap.com";
    const companyName = this.config.get<string>('COMPANY_NAME') ?? "TenantSwap";

    const template = React.createElement(MatchEmail, {
      title: input.title,
      message: input.message,
      actionLabel: input.actionLabel ?? "Go to Dashboard",
      actionUrl: input.actionUrl ?? `${frontendUrl}/dashboard`,
      footerNote: "Go to your dashboard to see your matches.",
      previewText: input.subject,
      appUrl: frontendUrl,
       supportEmail:supportEmail,
      companyName: companyName,
    });

    const html = await render(template);

    return this.dispatchEmail({
      type: 'notification',
      to: input.email,
      subject: input.subject,
      text: textLines.join('\n'),
      html,
    });
  }

  async sendAdminTemplateEmail(
    input: AdminTemplateEmailInput,
  ): Promise<EmailDispatchResult> {
    return this.dispatchEmail({
      type: 'campaign',
      to: input.email,
      subject: input.subject,
      text: input.text,
      html: input.html,
      recipientUserId: input.recipientUserId,
      templateSlug: input.templateSlug,
    });
  }

  private async writeEmailLog(input: {
    type: 'verification' | 'notification' | 'campaign';
    to: string;
    subject: string;
    result: EmailDispatchResult;
    recipientUserId?: string;
    templateSlug?: string;
  }): Promise<void> {
    if (!this.prisma) return;
    const emailTypeMap: Record<string, string> = {
      verification: 'VERIFICATION',
      notification: 'SYSTEM',
      campaign: 'CAMPAIGN',
    };
    try {
      await this.prisma.emailLog.create({
        data: {
          recipientEmail: input.to,
          recipientUserId: input.recipientUserId ?? null,
          subject: input.subject,
          type: emailTypeMap[input.type] as any ?? 'SYSTEM',
          templateSlug: input.templateSlug ?? null,
          status: input.result.delivered ? 'SENT' : input.result.provider === 'log-only' ? 'SKIPPED' : 'FAILED',
          provider: input.result.provider,
          attempts: input.result.attempts,
          messageId: input.result.messageId ?? null,
          error: input.result.error ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`[EMAIL_LOG_FAIL] Could not write email log: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async dispatchEmail(input: {
    type: 'verification' | 'notification' | 'campaign';
    to: string;
    subject: string;
    text: string;
    html: string;
    recipientUserId?: string;
    templateSlug?: string;
  }): Promise<EmailDispatchResult> {
    const useMailgunApi = !!(this.mailgunApiKey && this.mailgunDomain && this.fromAddress);
    const useSmtp = !!(this.transporter && this.fromAddress);

    if (!useMailgunApi && !useSmtp) {
      this.logger.warn(
        `[EMAIL_SKIPPED] type=${input.type} email=${input.to} reason=no_transport_configured`,
      );
      const skippedResult: EmailDispatchResult = {
        delivered: false,
        provider: 'log-only',
        attempts: 0,
        error: 'smtp_not_configured',
      };
      void this.writeEmailLog({ type: input.type, to: input.to, subject: input.subject, result: skippedResult, recipientUserId: input.recipientUserId, templateSlug: input.templateSlug });
      return skippedResult;
    }

    let lastError = 'unknown_error';

    for (let attempt = 1; attempt <= this.retryMaxAttempts; attempt += 1) {
      try {
        let messageId: string;

        if (useMailgunApi) {
          this.logger.log(
            `[EMAIL_ATTEMPT] type=${input.type} email=${input.to} attempt=${attempt} provider=mailgun-api`,
          );
          messageId = await this.sendViaMailgunApi({
            from: this.fromAddress!,
            to: input.to,
            subject: input.subject,
            text: input.text,
            html: input.html,
          });
        } else {
          this.logger.log(
            `[EMAIL_ATTEMPT] type=${input.type} email=${input.to} attempt=${attempt} provider=smtp`,
          );
          const response = await this.transporter!.sendMail({
            from: this.fromAddress,
            to: input.to,
            subject: input.subject,
            text: input.text,
            html: input.html,
          });
          messageId = response.messageId as string;
        }

        this.logger.log(
          `[EMAIL_SENT] type=${input.type} email=${input.to} attempt=${attempt} messageId=${messageId} provider=${useMailgunApi ? 'mailgun-api' : 'smtp'}`,
        );

        const result: EmailDispatchResult = {
          delivered: true,
          provider: 'smtp',
          attempts: attempt,
          messageId,
        };
        void this.writeEmailLog({ type: input.type, to: input.to, subject: input.subject, result, recipientUserId: input.recipientUserId, templateSlug: input.templateSlug });
        return result;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error.message : 'unknown_error';
        this.logger.warn(
          `[EMAIL_SEND_RETRY] type=${input.type} email=${input.to} attempt=${attempt} error="${lastError}"`,
        );

        if (attempt < this.retryMaxAttempts) {
          await this.sleep(this.retryDelayMs * attempt);
        }
      }
    }

    this.logger.error(
      `[EMAIL_SEND_FAILED] type=${input.type} email=${input.to} attempts=${this.retryMaxAttempts} error="${lastError}"`,
    );

    const failResult: EmailDispatchResult = {
      delivered: false,
      provider: 'smtp',
      attempts: this.retryMaxAttempts,
      error: lastError,
    };
    void this.writeEmailLog({ type: input.type, to: input.to, subject: input.subject, result: failResult, recipientUserId: input.recipientUserId, templateSlug: input.templateSlug });
    return failResult;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
