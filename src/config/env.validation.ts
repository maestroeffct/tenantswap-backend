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
  };
}
