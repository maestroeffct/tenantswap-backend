-- CreateEnum
CREATE TYPE "ChainStatus" AS ENUM ('LOCKED', 'BROKEN', 'COMPLETED');

-- CreateTable
CREATE TABLE "MatchCandidate" (
    "id" TEXT NOT NULL,
    "fromListingId" TEXT NOT NULL,
    "toListingId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwapChain" (
    "id" TEXT NOT NULL,
    "status" "ChainStatus" NOT NULL DEFAULT 'LOCKED',
    "cycleSize" INTEGER NOT NULL,
    "avgScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SwapChain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwapChainMember" (
    "id" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "SwapChainMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchCandidate_fromListingId_idx" ON "MatchCandidate"("fromListingId");

-- CreateIndex
CREATE INDEX "MatchCandidate_toListingId_idx" ON "MatchCandidate"("toListingId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchCandidate_fromListingId_toListingId_key" ON "MatchCandidate"("fromListingId", "toListingId");

-- CreateIndex
CREATE INDEX "SwapChainMember_userId_idx" ON "SwapChainMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SwapChainMember_chainId_listingId_key" ON "SwapChainMember"("chainId", "listingId");

-- AddForeignKey
ALTER TABLE "SwapChainMember" ADD CONSTRAINT "SwapChainMember_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "SwapChain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
