export type StockStatus = "IN_STOCK" | "LOW" | "OUT";

export type InventoryRow = {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  stockQty: number;
  cost: number;
  sellingPrice: number;
  value: number;
  potentialProfit: number;
  usage: number;
  status: StockStatus;
};

export type InventoryTotals = {
  totalParts: number;
  inventoryValue: number;
  potentialProfit: number;
  lowStock: number;
  outOfStock: number;
};

export type InventoryReportResponse = {
  totals: InventoryTotals;
  parts: InventoryRow[];
  categories: string[];
  usageWindowDays: number;
  lowStockThreshold: number;
};

export type StockLedgerLog = {
  id: string;
  createdAt: string;
  logType: "PURCHASE_IN" | "JOBCARD_OUT" | "ADJUSTMENT";
  changeQty: number;
  balanceQty: number;
  notes: string | null;
  purchaseId: string | null;
  jobCardId: string | null;
  jobNumber: string | null;
  createdBy: { id: string; fullName: string } | null;
};

export type StockLedgerResponse = {
  part: {
    id: string;
    name: string;
    sku: string;
    category: string | null;
    stockQty: number;
    cost: number;
    sellingPrice: number;
  };
  logs: StockLedgerLog[];
};
