type RawEnv = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asPositiveInt(value: unknown, key: string, fallback?: number): number {
  const stringValue = asString(value);
  const resolved =
    stringValue ?? (fallback !== undefined ? String(fallback) : '');

  const parsed = Number.parseInt(resolved, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }

  return parsed;
}

function asBoolean(value: unknown, fallback = false): boolean {
  const stringValue = asString(value);
  if (!stringValue) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on'].includes(stringValue.toLowerCase())) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(stringValue.toLowerCase())) {
    return false;
  }

  throw new Error('Boolean environment variables must be true/false');
}

function asCsvList(value: unknown): string[] {
  const stringValue = asString(value);
  if (!stringValue) {
    return [];
  }

  return stringValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertJwtExpiresIn(value: string): void {
  const valid = /^\d+[smhd]$/.test(value);
  if (!valid) {
    throw new Error(
      'JWT_EXPIRES_IN must look like 15m, 1h, or 7d (number + s|m|h|d)',
    );
  }
}

export function validateEnv(config: RawEnv): RawEnv {
  const databaseUrl = asString(config.DATABASE_URL);
  const jwtSecret = asString(config.JWT_SECRET);
  const jwtExpiresIn = asString(config.JWT_EXPIRES_IN) ?? '15m';
  const frontendVerifyEmailUrl =
    asString(config.FRONTEND_VERIFY_EMAIL_URL) ??
    'http://localhost:3000/verify-email';

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  if (
    !databaseUrl.startsWith('postgresql://') &&
    !databaseUrl.startsWith('postgres://')
  ) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }

  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET is required and must be at least 32 characters',
    );
  }

  assertJwtExpiresIn(jwtExpiresIn);

  return {
    ...config,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: jwtExpiresIn,
    FRONTEND_VERIFY_EMAIL_URL: frontendVerifyEmailUrl,
    PORT: asPositiveInt(config.PORT, 'PORT', 3000),
    THROTTLE_GLOBAL_TTL_MS: asPositiveInt(
      config.THROTTLE_GLOBAL_TTL_MS,
      'THROTTLE_GLOBAL_TTL_MS',
      60_000,
    ),
    THROTTLE_GLOBAL_LIMIT: asPositiveInt(
      config.THROTTLE_GLOBAL_LIMIT,
      'THROTTLE_GLOBAL_LIMIT',
      100,
    ),
    THROTTLE_AUTH_TTL_MS: asPositiveInt(
      config.THROTTLE_AUTH_TTL_MS,
      'THROTTLE_AUTH_TTL_MS',
      60_000,
    ),
    THROTTLE_AUTH_LIMIT: asPositiveInt(
      config.THROTTLE_AUTH_LIMIT,
      'THROTTLE_AUTH_LIMIT',
      5,
    ),
    THROTTLE_MATCH_RUN_TTL_MS: asPositiveInt(
      config.THROTTLE_MATCH_RUN_TTL_MS,
      'THROTTLE_MATCH_RUN_TTL_MS',
      60_000,
    ),
    THROTTLE_MATCH_RUN_LIMIT: asPositiveInt(
      config.THROTTLE_MATCH_RUN_LIMIT,
      'THROTTLE_MATCH_RUN_LIMIT',
      10,
    ),
    AUTH_LOGIN_MAX_ATTEMPTS: asPositiveInt(
      config.AUTH_LOGIN_MAX_ATTEMPTS,
      'AUTH_LOGIN_MAX_ATTEMPTS',
      5,
    ),
    AUTH_LOGIN_WINDOW_MS: asPositiveInt(
      config.AUTH_LOGIN_WINDOW_MS,
      'AUTH_LOGIN_WINDOW_MS',
      900_000,
    ),
    AUTH_LOGIN_LOCK_MS: asPositiveInt(
      config.AUTH_LOGIN_LOCK_MS,
      'AUTH_LOGIN_LOCK_MS',
      900_000,
    ),
    EMAIL_VERIFICATION_TOKEN_TTL_MS: asPositiveInt(
      config.EMAIL_VERIFICATION_TOKEN_TTL_MS,
      'EMAIL_VERIFICATION_TOKEN_TTL_MS',
      86_400_000,
    ),
    CHAIN_ACCEPT_TTL_HOURS: asPositiveInt(
      config.CHAIN_ACCEPT_TTL_HOURS,
      'CHAIN_ACCEPT_TTL_HOURS',
      24,
    ),
    CHAIN_EXPIRE_SWEEP_LIMIT: asPositiveInt(
      config.CHAIN_EXPIRE_SWEEP_LIMIT,
      'CHAIN_EXPIRE_SWEEP_LIMIT',
      50,
    ),
    INTEREST_REQUEST_TTL_HOURS: asPositiveInt(
      config.INTEREST_REQUEST_TTL_HOURS,
      'INTEREST_REQUEST_TTL_HOURS',
      48,
    ),
    INTEREST_EXPIRE_SWEEP_LIMIT: asPositiveInt(
      config.INTEREST_EXPIRE_SWEEP_LIMIT,
      'INTEREST_EXPIRE_SWEEP_LIMIT',
      100,
    ),
    LISTING_ACTIVE_TTL_HOURS: asPositiveInt(
      config.LISTING_ACTIVE_TTL_HOURS,
      'LISTING_ACTIVE_TTL_HOURS',
      336,
    ),
    LISTING_EXPIRE_SWEEP_LIMIT: asPositiveInt(
      config.LISTING_EXPIRE_SWEEP_LIMIT,
      'LISTING_EXPIRE_SWEEP_LIMIT',
      100,
    ),
    INTEREST_MAX_OPEN_PER_REQUESTER: asPositiveInt(
      config.INTEREST_MAX_OPEN_PER_REQUESTER,
      'INTEREST_MAX_OPEN_PER_REQUESTER',
      25,
    ),
    INTEREST_MAX_DAILY_REQUESTS: asPositiveInt(
      config.INTEREST_MAX_DAILY_REQUESTS,
      'INTEREST_MAX_DAILY_REQUESTS',
      50,
    ),
    SUBSCRIPTION_ENFORCEMENT: asBoolean(
      config.SUBSCRIPTION_ENFORCEMENT,
      false,
    ),
    TESTER_ALLOWLIST: asCsvList(config.TESTER_ALLOWLIST),
    PAYMENT_PROVIDER: asString(config.PAYMENT_PROVIDER) ?? 'manual',
    PAYMENT_WEBHOOK_SECRET:
      asString(config.PAYMENT_WEBHOOK_SECRET) ?? 'dev-webhook-secret',
    SUBSCRIPTION_DEFAULT_PLAN:
      asString(config.SUBSCRIPTION_DEFAULT_PLAN) ?? 'basic_monthly',
    SUBSCRIPTION_DEFAULT_AMOUNT_MINOR: asPositiveInt(
      config.SUBSCRIPTION_DEFAULT_AMOUNT_MINOR,
      'SUBSCRIPTION_DEFAULT_AMOUNT_MINOR',
      5000,
    ),
    SUBSCRIPTION_DEFAULT_DURATION_DAYS: asPositiveInt(
      config.SUBSCRIPTION_DEFAULT_DURATION_DAYS,
      'SUBSCRIPTION_DEFAULT_DURATION_DAYS',
      30,
    ),
    RELIABILITY_CANCEL_SCORE_PENALTY: asPositiveInt(
      config.RELIABILITY_CANCEL_SCORE_PENALTY,
      'RELIABILITY_CANCEL_SCORE_PENALTY',
      5,
    ),
    RELIABILITY_NOSHOW_SCORE_PENALTY: asPositiveInt(
      config.RELIABILITY_NOSHOW_SCORE_PENALTY,
      'RELIABILITY_NOSHOW_SCORE_PENALTY',
      15,
    ),
    RELIABILITY_MANUAL_SCORE_PENALTY: asPositiveInt(
      config.RELIABILITY_MANUAL_SCORE_PENALTY,
      'RELIABILITY_MANUAL_SCORE_PENALTY',
      10,
    ),
    RELIABILITY_COOLDOWN_AFTER_CANCELLATIONS: asPositiveInt(
      config.RELIABILITY_COOLDOWN_AFTER_CANCELLATIONS,
      'RELIABILITY_COOLDOWN_AFTER_CANCELLATIONS',
      3,
    ),
    RELIABILITY_COOLDOWN_HOURS: asPositiveInt(
      config.RELIABILITY_COOLDOWN_HOURS,
      'RELIABILITY_COOLDOWN_HOURS',
      24,
    ),
    RELIABILITY_BLOCK_AFTER_NOSHOWS: asPositiveInt(
      config.RELIABILITY_BLOCK_AFTER_NOSHOWS,
      'RELIABILITY_BLOCK_AFTER_NOSHOWS',
      2,
    ),
    RELIABILITY_BLOCK_HOURS: asPositiveInt(
      config.RELIABILITY_BLOCK_HOURS,
      'RELIABILITY_BLOCK_HOURS',
      72,
    ),
    RELIABILITY_RANK_PENALTY_WEIGHT: asPositiveInt(
      config.RELIABILITY_RANK_PENALTY_WEIGHT,
      'RELIABILITY_RANK_PENALTY_WEIGHT',
      25,
    ),
  };
}
