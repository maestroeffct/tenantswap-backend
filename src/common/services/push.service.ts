import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private app: admin.app.App | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const projectId = this.config.get<string>('FCM_PROJECT_ID');
    const clientEmail = this.config.get<string>('FCM_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FCM_PRIVATE_KEY');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('FCM not configured — push notifications disabled');
      return;
    }

    if (admin.apps.length > 0) {
      this.app = admin.apps[0]!;
      this.logger.log('Firebase Admin already initialized — reusing existing app');
      return;
    }

    this.app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });

    this.logger.log(`Firebase Admin initialized project=${projectId}`);
  }

  async sendPush(input: {
    token: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<boolean> {
    if (!this.app) {
      this.logger.warn('[PUSH_SKIPPED] FCM not configured');
      return false;
    }

    try {
      const messageId = await admin.messaging(this.app).send({
        token: input.token,
        notification: {
          title: input.title,
          body: input.body,
        },
        data: input.data ?? {},
        webpush: {
          notification: {
            title: input.title,
            body: input.body,
            icon: '/assets/TenantSwap Logo.png',
            badge: '/assets/TenantSwap Logo Monochrome.png',
          },
          fcmOptions: {
            link: '/dashboard',
          },
        },
      });

      this.logger.log(`[PUSH_SENT] token=${input.token.slice(0, 20)}… messageId=${messageId}`);
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown_error';
      this.logger.warn(`[PUSH_FAILED] token=${input.token.slice(0, 20)}… error="${msg}"`);
      return false;
    }
  }

  async sendPushToMany(input: {
    tokens: string[];
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<void> {
    if (!this.app || input.tokens.length === 0) return;

    await Promise.allSettled(
      input.tokens.map((token) =>
        this.sendPush({ token, title: input.title, body: input.body, data: input.data }),
      ),
    );
  }
}
