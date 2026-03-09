-- Add OAuth and profile setup fields on User.
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'APPLE');
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

ALTER TABLE "User"
ADD COLUMN "oauthProvider" "AuthProvider",
ADD COLUMN "oauthProviderUserId" TEXT,
ADD COLUMN "profilePhotoUrl" TEXT,
ADD COLUMN "gender" "Gender",
ADD COLUMN "occupation" TEXT,
ADD COLUMN "allowIncomingCalls" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "User_oauthProvider_oauthProviderUserId_key"
ON "User"("oauthProvider", "oauthProviderUserId");
