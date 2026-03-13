import { PassportStrategy } from "@nestjs/passport";
import { Strategy, VerifyCallback } from "passport-google-oauth20";
import { Injectable, Ip } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "src/modules/auth/auth.service";
import { OauthUser } from "../@types";


@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(
    private configService: ConfigService,
    private authService: AuthService
  ) {
    const clientCredentials = {
      clientID: configService.getOrThrow<string>("GOOGLE_OAUTH_CLIENT_ID"),
      clientSecret: configService.getOrThrow<string>(
        "GOOGLE_OAUTH_CLIENT_SECRET"
      ),
      callbackURL: configService.getOrThrow<string>(
        "GOOGLE_OAUTH_CALLBACK_URL"
      ),
      scope: ["email", "profile"],
    };

    super(clientCredentials);
  }
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {

    // console.log(profile);

    const user: OauthUser = {
      id: profile.id,
      name: profile.displayName,
      email: profile.emails[0].value,
      avatar: profile.photos[0].value,
      accessToken: accessToken,
    };
    // console.log("user", user);

    done(null, user);


  }
}
