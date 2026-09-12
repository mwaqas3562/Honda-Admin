-- Convert all monetary Decimal columns to INTEGER using FLOOR.
-- All existing decimal data is floored (e.g., 99.99 -> 99).

-- Part
ALTER TABLE "Part"
  ALTER COLUMN "costPrice"    TYPE INTEGER USING FLOOR("costPrice")::int,
  ALTER COLUMN "costPrice"    SET DEFAULT 0,
  ALTER COLUMN "unitPrice"    TYPE INTEGER USING FLOOR("unitPrice")::int,
  ALTER COLUMN "unitPrice"    SET DEFAULT 0,
  ALTER COLUMN "sellingPrice" TYPE INTEGER USING FLOOR("sellingPrice")::int,
  ALTER COLUMN "sellingPrice" SET DEFAULT 0;

-- Purchase
ALTER TABLE "Purchase"
  ALTER COLUMN "totalCost" TYPE INTEGER USING FLOOR("totalCost")::int,
  ALTER COLUMN "totalCost" SET DEFAULT 0;

-- PurchaseItem
ALTER TABLE "PurchaseItem"
  ALTER COLUMN "costPrice"  TYPE INTEGER USING FLOOR("costPrice")::int,
  ALTER COLUMN "costPrice"  SET DEFAULT 0,
  ALTER COLUMN "totalPrice" TYPE INTEGER USING FLOOR("totalPrice")::int,
  ALTER COLUMN "totalPrice" SET DEFAULT 0;

-- JobCard
ALTER TABLE "JobCard"
  ALTER COLUMN "laborAmount" TYPE INTEGER USING FLOOR("laborAmount")::int,
  ALTER COLUMN "laborAmount" SET DEFAULT 0,
  ALTER COLUMN "partsAmount" TYPE INTEGER USING FLOOR("partsAmount")::int,
  ALTER COLUMN "partsAmount" SET DEFAULT 0,
  ALTER COLUMN "totalAmount" TYPE INTEGER USING FLOOR("totalAmount")::int,
  ALTER COLUMN "totalAmount" SET DEFAULT 0;

-- Invoice
ALTER TABLE "Invoice"
  ALTER COLUMN "subtotal"    TYPE INTEGER USING FLOOR("subtotal")::int,
  ALTER COLUMN "subtotal"    SET DEFAULT 0,
  ALTER COLUMN "discountPct" TYPE INTEGER USING FLOOR("discountPct")::int,
  ALTER COLUMN "discountPct" SET DEFAULT 0,
  ALTER COLUMN "discountAmt" TYPE INTEGER USING FLOOR("discountAmt")::int,
  ALTER COLUMN "discountAmt" SET DEFAULT 0,
  ALTER COLUMN "taxAmount"   TYPE INTEGER USING FLOOR("taxAmount")::int,
  ALTER COLUMN "taxAmount"   SET DEFAULT 0,
  ALTER COLUMN "totalAmount" TYPE INTEGER USING FLOOR("totalAmount")::int,
  ALTER COLUMN "totalAmount" SET DEFAULT 0,
  ALTER COLUMN "totalCost"   TYPE INTEGER USING FLOOR("totalCost")::int,
  ALTER COLUMN "totalCost"   SET DEFAULT 0,
  ALTER COLUMN "totalProfit" TYPE INTEGER USING FLOOR("totalProfit")::int,
  ALTER COLUMN "totalProfit" SET DEFAULT 0,
  ALTER COLUMN "paidAmount"  TYPE INTEGER USING FLOOR("paidAmount")::int,
  ALTER COLUMN "paidAmount"  SET DEFAULT 0;

-- InvoiceItem
ALTER TABLE "InvoiceItem"
  ALTER COLUMN "rate"      TYPE INTEGER USING FLOOR("rate")::int,
  ALTER COLUMN "rate"      SET DEFAULT 0,
  ALTER COLUMN "total"     TYPE INTEGER USING FLOOR("total")::int,
  ALTER COLUMN "total"     SET DEFAULT 0,
  ALTER COLUMN "costPrice" TYPE INTEGER USING FLOOR("costPrice")::int,
  ALTER COLUMN "costPrice" SET DEFAULT 0,
  ALTER COLUMN "profit"    TYPE INTEGER USING FLOOR("profit")::int,
  ALTER COLUMN "profit"    SET DEFAULT 0;

-- CashEntry
ALTER TABLE "CashEntry"
  ALTER COLUMN "amount" TYPE INTEGER USING FLOOR("amount")::int,
  ALTER COLUMN "amount" SET DEFAULT 0;

-- Expense
ALTER TABLE "Expense"
  ALTER COLUMN "amount" TYPE INTEGER USING FLOOR("amount")::int,
  ALTER COLUMN "amount" SET DEFAULT 0;
