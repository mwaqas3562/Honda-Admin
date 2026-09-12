export type Metric = {
  value: number;
  trendPct: number | null;
  hint?: string;
};

export type ReportsMetrics = {
  inventoryValue: Metric;
  salesRevenue: Metric;
  purchaseCosts: Metric;
  servicesRevenue: Metric;
  grossProfit: Metric;
  lowStockCount: Metric;
};

export type DailySalesPoint = { date: string; total: number };
export type StockMovementPoint = {
  type: "PURCHASE_IN" | "JOBCARD_OUT" | "ADJUSTMENT";
  count: number;
  qty: number;
};
export type TopPartPoint = {
  partId: string;
  name: string;
  sku: string;
  qty: number;
  revenue: number;
};
export type CategoryBreakdownPoint = { category: string; value: number };

export type ReportsOverviewResponse = {
  range: { from: string; to: string };
  compareRange: { from: string; to: string };
  metrics: ReportsMetrics;
  charts: {
    dailySales: DailySalesPoint[];
    stockMovement: StockMovementPoint[];
    topParts: TopPartPoint[];
    categoryBreakdown: CategoryBreakdownPoint[];
  };
};
