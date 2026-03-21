CREATE TABLE "VacancyAlert" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "apartmentType" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "area" TEXT,
  "features" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VacancyAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VacancyAlert_listingId_key" ON "VacancyAlert"("listingId");
CREATE INDEX "VacancyAlert_userId_createdAt_idx" ON "VacancyAlert"("userId", "createdAt");
CREATE INDEX "VacancyAlert_state_city_area_createdAt_idx" ON "VacancyAlert"("state", "city", "area", "createdAt");

ALTER TABLE "VacancyAlert"
ADD CONSTRAINT "VacancyAlert_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VacancyAlert"
ADD CONSTRAINT "VacancyAlert_listingId_fkey"
FOREIGN KEY ("listingId") REFERENCES "SwapListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
