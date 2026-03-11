import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';


export type OAuthProviderType = 'google' | 'apple';

export type OAuthIdentity = {
  provider: OAuthProviderType;
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  fullName?: string;
  profilePhotoUrl?: string;
};

@Injectable()
export class OauthService {
  private readonly logger = new Logger(OauthService.name);

  constructor(private readonly config: ConfigService) {}

  async verifyIdentityToken(
    provider: OAuthProviderType,
    idToken: string,
  ): Promise<OAuthIdentity> {
    if (provider === 'google') {
      return this.verifyGoogleIdToken(idToken);
    }

    throw new BadRequestException('Unsupported oauth provider');
  }

  private async verifyGoogleIdToken(idToken: string): Promise<OAuthIdentity> {
    const expectedClientId = this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID');


    if (!expectedClientId) {
      throw new ServiceUnavailableException('Google OAuth is not configured');
    }

    const tokenInfoUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
      idToken,
    )}`;

    let response: Response;
    try {
      response = await fetch(tokenInfoUrl);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`[OAUTH_GOOGLE_VERIFY_FAILED] error="${message}"`);
      throw new ServiceUnavailableException(
        'Unable to verify OAuth identity token',
      );
    }

    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok) {
      this.logger.warn(
        `[OAUTH_GOOGLE_INVALID_TOKEN] status=${response.status} body=${JSON.stringify(body)}`,
      );
      throw new UnauthorizedException('Invalid OAuth token');
    }

    const aud = typeof body.aud === 'string' ? body.aud.trim() : '';
    const iss = typeof body.iss === 'string' ? body.iss.trim() : '';
    const sub = typeof body.sub === 'string' ? body.sub.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const emailVerifiedRaw = body.email_verified;

    const emailVerified =
      emailVerifiedRaw === true ||
      (typeof emailVerifiedRaw === 'string' &&
        emailVerifiedRaw.trim().toLowerCase() === 'true');

    if (!sub || !email) {
      throw new UnauthorizedException('OAuth token payload is incomplete');
    }

    if (aud !== expectedClientId) {
      throw new UnauthorizedException('Invalid OAuth audience');
    }

    if (!['accounts.google.com', 'https://accounts.google.com'].includes(iss)) {
      throw new UnauthorizedException('Invalid OAuth issuer');
    }

    if (!emailVerified) {
      throw new UnauthorizedException('Google account email is not verified');
    }

    const fullName =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : undefined;

    const profilePhotoUrl =
      typeof body.picture === 'string' && body.picture.trim()
        ? body.picture.trim()
        : undefined;

    return {
      provider: 'google',
      providerUserId: sub,
      email: email.toLowerCase(),
      emailVerified,
      fullName,
      profilePhotoUrl,
    };
  }
}
