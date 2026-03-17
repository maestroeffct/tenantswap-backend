import { z } from 'zod';

type RawEnv = Record<string, unknown>;

function requiredString(key: string) {
  return z.any().transform((value, ctx) => {
    if (typeof value !== 'string' || !value.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${key} is required`,
      });
      return z.NEVER;
    }

    return value.trim();
  });
}

function optionalString() {
  return z.any().transform((value) => {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  });
}

function positiveIntWithDefault(key: string, fallback: number) {
  return z.any().transform((value, ctx) => {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseInt(value.trim(), 10)
          : Number.NaN;

    if (!Number.isInteger(parsed) || parsed <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${key} must be a positive integer`,
      });
      return z.NEVER;
    }

    return parsed;
  });
}

function booleanWithDefault(key: string, fallback: boolean) {
  return z.any().transform((value, ctx) => {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      if (value === 1) return true;
      if (value === 0) return false;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
      }

      if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${key} must be true/false`,
    });
    return z.NEVER;
  });
}

function csvList() {
  return z.any().transform((value) => {
    if (typeof value !== 'string' || !value.trim()) {
      return [] as string[];
    }

    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  });
}

const jwtExpiresIn = z.any().transform((value, ctx) => {
  const resolved =
    typeof value === 'string' && value.trim() ? value.trim() : '15m';

  if (!/^\d+[smhd]$/.test(resolved)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'JWT_EXPIRES_IN must look like 15m, 1h, or 7d (number + s|m|h|d)',
    });
    return z.NEVER;
  }

  return resolved;
});

const envSchema = z
  .object({
    DATABASE_URL: requiredString('DATABASE_URL').refine(
      (value) =>
        value.startsWith('postgresql://') || value.startsWith('postgres://'),
      {
        message: 'DATABASE_URL must be a PostgreSQL connection string',
      },
    ),
    JWT_SECRET: requiredString('JWT_SECRET').refine(
      (value) => value.length >= 32,
      {
        message: 'JWT_SECRET is required and must be at least 32 characters',
      },
    ),
    JWT_EXPIRES_IN: jwtExpiresIn,
    FRONTEND_VERIFY_EMAIL_URL: z.any().transform((value) => {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      return 'http://localhost:3000/verify-email';
    }),
    GOOGLE_OAUTH_CLIENT_ID: optionalString(),
    GOOGLE_OAUTH_CLIENT_SECRET: optionalString(),
    GOOGLE_OAUTH_CALLBACK_URL: optionalString(),
    GOOGLE_OAUTH_FRONTEND_CALLBACK_URL: optionalString(),

    QUEUE_ENABLED: booleanWithDefault('QUEUE_ENABLED', false),
    REDIS_HOST: z.any().transform((value) => {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      return '127.0.0.1';
    }),
    REDIS_PORT: positiveIntWithDefault('REDIS_PORT', 6379),
    REDIS_PASSWORD: optionalString(),
    REDIS_DB: z.any().transform((value, ctx) => {
      if (value === undefined || value === null || value === '') {
        return 0;
      }

      const parsed =
        typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? Number.parseInt(value.trim(), 10)
            : Number.NaN;

      if (!Number.isInteger(parsed) || parsed < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'REDIS_DB must be a non-negative integer',
        });
        return z.NEVER;
      }

      return parsed;
    }),

    PORT: positiveIntWithDefault('PORT', 3000),
    THROTTLE_GLOBAL_TTL_MS: positiveIntWithDefault(
      'THROTTLE_GLOBAL_TTL_MS',
      60_000,
    ),
    THROTTLE_GLOBAL_LIMIT: positiveIntWithDefault('THROTTLE_GLOBAL_LIMIT', 100),
    THROTTLE_AUTH_TTL_MS: positiveIntWithDefault(
      'THROTTLE_AUTH_TTL_MS',
      60_000,
    ),
    THROTTLE_AUTH_LIMIT: positiveIntWithDefault('THROTTLE_AUTH_LIMIT', 5),
    THROTTLE_MATCH_RUN_TTL_MS: positiveIntWithDefault(
      'THROTTLE_MATCH_RUN_TTL_MS',
      60_000,
    ),
    THROTTLE_MATCH_RUN_LIMIT: positiveIntWithDefault(
      'THROTTLE_MATCH_RUN_LIMIT',
      10,
    ),
    MATCHING_LIFECYCLE_SWEEP_MS: positiveIntWithDefault(
      'MATCHING_LIFECYCLE_SWEEP_MS',
      60_000,
    ),
    AUTH_LOGIN_MAX_ATTEMPTS: positiveIntWithDefault(
      'AUTH_LOGIN_MAX_ATTEMPTS',
      5,
    ),
    AUTH_LOGIN_WINDOW_MS: positiveIntWithDefault(
      'AUTH_LOGIN_WINDOW_MS',
      900_000,
    ),
    AUTH_LOGIN_LOCK_MS: positiveIntWithDefault('AUTH_LOGIN_LOCK_MS', 900_000),
    EMAIL_VERIFICATION_TOKEN_TTL_MS: positiveIntWithDefault(
      'EMAIL_VERIFICATION_TOKEN_TTL_MS',
      86_400_000,
    ),
    SMTP_HOST: optionalString(),
    SMTP_PORT: positiveIntWithDefault('SMTP_PORT', 587),
    SMTP_SECURE: booleanWithDefault('SMTP_SECURE', false),
    SMTP_USER: optionalString(),
    SMTP_PASS: optionalString(),
    MAIL_FROM: optionalString(),
    EMAIL_SEND_RETRY_MAX_ATTEMPTS: positiveIntWithDefault(
      'EMAIL_SEND_RETRY_MAX_ATTEMPTS',
      3,
    ),
    EMAIL_SEND_RETRY_DELAY_MS: positiveIntWithDefault(
      'EMAIL_SEND_RETRY_DELAY_MS',
      750,
    ),
    TERMII_API_KEY: optionalString(),
    TERMII_BASE_URL: z.any().transform((value) => {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      return 'https://api.ng.termii.com';
    }),
    TERMII_SENDER_ID: z.any().transform((value) => {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      return 'TenantSwap';
    }),
    TERMII_CHANNEL: z.any().transform((value) => {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      return 'dnd';
    }),
    TERMII_NOTIFICATION_CHANNEL: z.any().transform((value) => {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      return 'generic';
    }),
    TERMII_PIN_ATTEMPTS: positiveIntWithDefault('TERMII_PIN_ATTEMPTS', 5),
    TERMII_PIN_TTL_MINUTES: positiveIntWithDefault(
      'TERMII_PIN_TTL_MINUTES',
      10,
    ),
    TERMII_PIN_LENGTH: positiveIntWithDefault('TERMII_PIN_LENGTH', 6),
    TERMII_PIN_TYPE: z.any().transform((value) => {
      if (typeof value === 'string' && value.trim()) {
        return value.trim().toUpperCase();
      }

      return 'NUMERIC';
    }),
    TERMII_REQUEST_TIMEOUT_MS: positiveIntWithDefault(
      'TERMII_REQUEST_TIMEOUT_MS',
      10_000,
    ),
    PHONE_OTP_RESEND_COOLDOWN_SECONDS: positiveIntWithDefault(
      'PHONE_OTP_RESEND_COOLDOWN_SECONDS',
      60,
    ),
    NOTIFICATION_EMAIL_ENABLED: booleanWithDefault(
      'NOTIFICATION_EMAIL_ENABLED',
      true,
    ),
    NOTIFICATION_SMS_ENABLED: booleanWithDefault(
      'NOTIFICATION_SMS_ENABLED',
      true,
    ),
    AUTO_SEARCH_SWEEP_ENABLED: booleanWithDefault(
      'AUTO_SEARCH_SWEEP_ENABLED',
      true,
    ),
    AUTO_SEARCH_SWEEP_LIMIT: positiveIntWithDefault(
      'AUTO_SEARCH_SWEEP_LIMIT',
      100,
    ),
    CHAIN_ACCEPT_TTL_HOURS: positiveIntWithDefault(
      'CHAIN_ACCEPT_TTL_HOURS',
      24,
    ),
    CHAIN_EXPIRE_SWEEP_LIMIT: positiveIntWithDefault(
      'CHAIN_EXPIRE_SWEEP_LIMIT',
      50,
    ),
    INTEREST_REQUEST_TTL_HOURS: positiveIntWithDefault(
      'INTEREST_REQUEST_TTL_HOURS',
      48,
    ),
    INTEREST_EXPIRE_SWEEP_LIMIT: positiveIntWithDefault(
      'INTEREST_EXPIRE_SWEEP_LIMIT',
      100,
    ),
    LISTING_ACTIVE_TTL_HOURS: positiveIntWithDefault(
      'LISTING_ACTIVE_TTL_HOURS',
      336,
    ),
    LISTING_EXPIRE_SWEEP_LIMIT: positiveIntWithDefault(
      'LISTING_EXPIRE_SWEEP_LIMIT',
      100,
    ),
    INTEREST_MAX_OPEN_PER_REQUESTER: positiveIntWithDefault(
      'INTEREST_MAX_OPEN_PER_REQUESTER',
      25,
    ),
    INTEREST_MAX_DAILY_REQUESTS: positiveIntWithDefault(
      'INTEREST_MAX_DAILY_REQUESTS',
      50,
    ),
    SUBSCRIPTION_ENFORCEMENT: booleanWithDefault(
      'SUBSCRIPTION_ENFORCEMENT',
      false,
    ),
    TESTER_ALLOWLIST: csvList(),
    PAYMENT_PROVIDER: z.any().transform((value) => {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      return 'manual';
    }),
    PAYMENT_WEBHOOK_SECRET: z.any().transform((value) => {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      return 'dev-webhook-secret';
    }),
    SUBSCRIPTION_DEFAULT_PLAN: z.any().transform((value) => {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      return 'basic_monthly';
    }),
    SUBSCRIPTION_DEFAULT_AMOUNT_MINOR: positiveIntWithDefault(
      'SUBSCRIPTION_DEFAULT_AMOUNT_MINOR',
      5000,
    ),
    SUBSCRIPTION_DEFAULT_DURATION_DAYS: positiveIntWithDefault(
      'SUBSCRIPTION_DEFAULT_DURATION_DAYS',
      30,
    ),
    RELIABILITY_CANCEL_SCORE_PENALTY: positiveIntWithDefault(
      'RELIABILITY_CANCEL_SCORE_PENALTY',
      5,
    ),
    RELIABILITY_NOSHOW_SCORE_PENALTY: positiveIntWithDefault(
      'RELIABILITY_NOSHOW_SCORE_PENALTY',
      15,
    ),
    RELIABILITY_MANUAL_SCORE_PENALTY: positiveIntWithDefault(
      'RELIABILITY_MANUAL_SCORE_PENALTY',
      10,
    ),
    RELIABILITY_COOLDOWN_AFTER_CANCELLATIONS: positiveIntWithDefault(
      'RELIABILITY_COOLDOWN_AFTER_CANCELLATIONS',
      3,
    ),
    RELIABILITY_COOLDOWN_HOURS: positiveIntWithDefault(
      'RELIABILITY_COOLDOWN_HOURS',
      24,
    ),
    RELIABILITY_BLOCK_AFTER_NOSHOWS: positiveIntWithDefault(
      'RELIABILITY_BLOCK_AFTER_NOSHOWS',
      2,
    ),
    RELIABILITY_BLOCK_HOURS: positiveIntWithDefault(
      'RELIABILITY_BLOCK_HOURS',
      72,
    ),
    RELIABILITY_RANK_PENALTY_WEIGHT: positiveIntWithDefault(
      'RELIABILITY_RANK_PENALTY_WEIGHT',
      25,
    ),
  })
  .passthrough();

export function validateEnv(config: RawEnv): RawEnv {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join('; ');

    throw new Error(message);
  }

  return parsed.data;
}
