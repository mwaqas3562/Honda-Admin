-- Add receivedQty column to PurchaseItem (default 0 so DRAFT/CANCELLED rows stay zero).
ALTER TABLE "PurchaseItem" ADD COLUMN "receivedQty" INTEGER NOT NULL DEFAULT 0;

-- Backfill: for purchases already RECEIVED or PAID, treat the entire line
-- as fully received so stock-on-hand remains consistent with prior stock-in
-- logs that used the full quantity.
UPDATE "PurchaseItem" pi
SET "receivedQty" = pi."quantity"
FROM "Purchase" p
WHERE pi."purchaseId" = p."id"
  AND p."status" IN ('RECEIVED', 'PAID');

-- Recompute Purchase.totalCost based on received qty only (the bill reflects
-- what was actually received, not what was originally ordered).
UPDATE "Purchase" p
SET "totalCost" = COALESCE(s.total, 0)
FROM (
    SELECT "purchaseId", SUM("receivedQty" * "costPrice") AS total
    FROM "PurchaseItem"
    GROUP BY "purchaseId"
) s
WHERE p."id" = s."purchaseId"
  AND p."status" IN ('RECEIVED', 'PAID');
