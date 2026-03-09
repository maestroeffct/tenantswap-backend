-- Add phone verification fields for Termii OTP flow.
ALTER TABLE "User"
ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN "phoneVerificationPinId" TEXT,
ADD COLUMN "phoneVerificationExpiresAt" TIMESTAMP(3),
ADD COLUMN "phoneVerificationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "phoneVerificationLastSentAt" TIMESTAMP(3);
