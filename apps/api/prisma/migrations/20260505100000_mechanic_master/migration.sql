-- CreateEnum
CREATE TYPE "MechanicStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "Mechanic" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "status" "MechanicStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mechanic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mechanic_shopId_name_key" ON "Mechanic"("shopId", "name");
CREATE INDEX "Mechanic_shopId_idx" ON "Mechanic"("shopId");
CREATE INDEX "Mechanic_status_idx" ON "Mechanic"("status");
CREATE INDEX "Mechanic_isDeleted_idx" ON "Mechanic"("isDeleted");

-- AddForeignKey
ALTER TABLE "Mechanic" ADD CONSTRAINT "Mechanic_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Mechanic" ADD CONSTRAINT "Mechanic_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN "mechanicId" TEXT;
CREATE INDEX "JobCard_mechanicId_idx" ON "JobCard"("mechanicId");

-- Backfill: create one Mechanic per distinct (shopId, trimmed mechanicAssigned)
INSERT INTO "Mechanic" ("id", "shopId", "name", "status", "isDeleted", "createdAt", "updatedAt")
SELECT
    'mc_' || md5("shopId" || '|' || btrim("mechanicAssigned")) AS id,
    "shopId",
    btrim("mechanicAssigned") AS name,
    'ACTIVE'::"MechanicStatus",
    false,
    NOW(),
    NOW()
FROM (
    SELECT DISTINCT "shopId", "mechanicAssigned"
    FROM "JobCard"
    WHERE "mechanicAssigned" IS NOT NULL AND btrim("mechanicAssigned") <> ''
) AS distinct_mechanics
ON CONFLICT ("shopId", "name") DO NOTHING;

-- Link JobCards to created Mechanic rows
UPDATE "JobCard" jc
SET "mechanicId" = m."id"
FROM "Mechanic" m
WHERE jc."shopId" = m."shopId"
  AND btrim(jc."mechanicAssigned") = m."name"
  AND jc."mechanicAssigned" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_mechanicId_fkey" FOREIGN KEY ("mechanicId") REFERENCES "Mechanic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
