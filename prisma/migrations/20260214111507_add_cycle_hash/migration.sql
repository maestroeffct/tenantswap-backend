/*
  Warnings:

  - A unique constraint covering the columns `[cycleHash]` on the table `SwapChain` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `cycleHash` to the `SwapChain` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SwapChain" ADD COLUMN     "cycleHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SwapChain_cycleHash_key" ON "SwapChain"("cycleHash");
