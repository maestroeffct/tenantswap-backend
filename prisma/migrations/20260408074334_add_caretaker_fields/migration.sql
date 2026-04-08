-- AlterTable
ALTER TABLE "SwapListing" ADD COLUMN     "caretakerName" TEXT,
ADD COLUMN     "caretakerPhone" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "caretakerPromptDismissedAt" TIMESTAMP(3);
