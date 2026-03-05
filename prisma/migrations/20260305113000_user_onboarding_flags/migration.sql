-- Add onboarding/profile preference flags used during registration and matching UX.
ALTER TABLE "User"
ADD COLUMN "canConnectLandlord" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hasLandlordContact" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "onboardingComplete" BOOLEAN NOT NULL DEFAULT false;
