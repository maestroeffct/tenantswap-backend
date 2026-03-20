import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

function stripQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function loadEnvFile(filename: string) {
  const filePath = resolve(process.cwd(), filename);
  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripQuotes(line.slice(separatorIndex + 1).trim());

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile('.env.test.local');
loadEnvFile('.env.test');

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'postgresql://tenantswap:tenantswap@localhost:5432/tenantswap_test_db';
process.env.JWT_SECRET ??= 'test-jwt-secret-with-at-least-32-chars';
process.env.JWT_EXPIRES_IN ??= '1h';
process.env.FRONTEND_VERIFY_EMAIL_URL ??= 'http://localhost:3000/verify-email';
process.env.PORT ??= '3100';
process.env.QUEUE_ENABLED ??= 'false';
process.env.AUTO_SEARCH_SWEEP_ENABLED ??= 'false';
process.env.MATCHING_LIFECYCLE_SWEEP_MS ??= '3600000';
process.env.SUBSCRIPTION_ENFORCEMENT ??= 'false';
process.env.NOTIFICATION_EMAIL_ENABLED ??= 'false';
process.env.NOTIFICATION_SMS_ENABLED ??= 'false';
process.env.EMAIL_SEND_RETRY_MAX_ATTEMPTS ??= '1';
process.env.EMAIL_SEND_RETRY_DELAY_MS ??= '1';
process.env.PAYMENT_WEBHOOK_SECRET ??= 'test-webhook-secret';
