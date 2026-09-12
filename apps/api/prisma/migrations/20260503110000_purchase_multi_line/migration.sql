-- ─────────────────────────────────────────────────────────────────────
-- Purchase Module: convert single-line Purchase rows to multi-line
-- (Purchase + PurchaseItem) with auto-numbering and PAID status.
-- Existing data is preserved by lifting each Purchase row's part/qty/cost
-- into a single PurchaseItem child.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Add PAID enum value
ALTER TYPE "PurchaseStatus" ADD VALUE IF NOT EXISTS 'PAID';

-- 2. Create PurchaseItem child table
CREATE TABLE "PurchaseItem" (
    "id"         TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "partId"     TEXT NOT NULL,
    "quantity"   INTEGER NOT NULL,
    "costPrice"  DECIMAL(12,2) NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurchaseItem_purchaseId_idx" ON "PurchaseItem"("purchaseId");
CREATE INDEX "PurchaseItem_partId_idx"     ON "PurchaseItem"("partId");

-- 3. Backfill: lift each existing Purchase row's legacy single-line fields
--    into a PurchaseItem child row.
INSERT INTO "PurchaseItem" ("id", "purchaseId", "partId", "quantity", "costPrice", "totalPrice", "createdAt")
SELECT
    'pi_' || substring(md5(random()::text || clock_timestamp()::text), 1, 24) || row_number() OVER (ORDER BY "createdAt"),
    "id",
    "partId",
    "quantity",
    "unitCost",
    "totalCost",
    "createdAt"
FROM "Purchase";

-- 4. Add new Purchase columns (purchaseNo nullable initially, paidAt, receivedAt, notes)
ALTER TABLE "Purchase" ADD COLUMN "purchaseNo" TEXT;
ALTER TABLE "Purchase" ADD COLUMN "paidAt"     TIMESTAMP(3);
ALTER TABLE "Purchase" ADD COLUMN "receivedAt" TIMESTAMP(3);
ALTER TABLE "Purchase" ADD COLUMN "notes"      TEXT;

-- 5. Backfill purchaseNo using per-shop sequential numbering (P-1, P-2, …)
WITH numbered AS (
    SELECT "id",
           'P-' || row_number() OVER (PARTITION BY "shopId" ORDER BY "createdAt", "id") AS new_no
    FROM "Purchase"
)
UPDATE "Purchase" p
SET "purchaseNo" = n.new_no
FROM numbered n
WHERE p."id" = n."id";

-- 6. Backfill receivedAt for already-RECEIVED purchases
UPDATE "Purchase" SET "receivedAt" = "purchasedAt" WHERE "status" = 'RECEIVED';

-- 7. Seed NumberSequence so new purchases continue from where backfill left off
INSERT INTO "NumberSequence" ("id", "shopId", "kind", "lastValue", "updatedAt")
SELECT
    'ns_' || substring(md5(random()::text || "shopId" || clock_timestamp()::text), 1, 24),
    "shopId",
    'PURCHASE',
    COUNT(*),
    NOW()
FROM "Purchase"
GROUP BY "shopId"
ON CONFLICT ("shopId", "kind") DO UPDATE SET "lastValue" = EXCLUDED."lastValue", "updatedAt" = NOW();

-- 8. Lock down purchaseNo: NOT NULL + unique per shop
ALTER TABLE "Purchase" ALTER COLUMN "purchaseNo" SET NOT NULL;
CREATE UNIQUE INDEX "Purchase_shopId_purchaseNo_key" ON "Purchase"("shopId", "purchaseNo");
CREATE INDEX        "Purchase_status_idx"            ON "Purchase"("status");

-- 9. Drop legacy single-line columns + their FK/index
DROP INDEX IF EXISTS "Purchase_partId_idx";
ALTER TABLE "Purchase" DROP CONSTRAINT IF EXISTS "Purchase_partId_fkey";
ALTER TABLE "Purchase" DROP COLUMN "partId";
ALTER TABLE "Purchase" DROP COLUMN "quantity";
ALTER TABLE "Purchase" DROP COLUMN "unitCost";

-- 10. Set totalCost default 0 (already exists), keep column.

-- 11. Wire PurchaseItem foreign keys
ALTER TABLE "PurchaseItem"
  ADD CONSTRAINT "PurchaseItem_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseItem"
  ADD CONSTRAINT "PurchaseItem_partId_fkey"
  FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
