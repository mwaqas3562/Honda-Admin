export type ProfitInvoiceRow = {
  id: string;
  invoiceNumber: string;
  date: string;
  customerId: string | null;
  customerName: string;
  jobCardId: string | null;
  jobNumber: string | null;
  vehicle: string | null;
  qty: number;
  labour: number;
  parts: number;
  discount: number;
  bill: number;
  revenue: number;
  cost: number;
  profit: number;
  wheelBalanceQty: number;
  wheelBalanceSale: number;
};

export type ProfitReportTotals = {
  labour: number;
  parts: number;
  discount: number;
  bill: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  netProfit: number;
  profitPct: number;
  invoiceCount: number;
  wheelBalanceQty: number;
  wheelBalanceSale: number;
};

export type ProfitReportResponse = {
  totals: ProfitReportTotals;
  invoices: ProfitInvoiceRow[];
};

export type ProfitLineRow = {
  id: string;
  itemCode: string | null;
  itemName: string;
  qty: number;
  rate: number;
  lineRevenue: number;
  lineDiscount: number;
  netLineRevenue: number;
  unitCost: number;
  lineCost: number;
  lineProfit: number;
  matched: boolean;
  remarks: string | null;
};

export type InvoiceProfitBreakdown = {
  invoice: {
    id: string;
    invoiceNumber: string;
    date: string;
    status: string;
    customer: { id: string; name: string; phone: string | null } | null;
    jobCard: {
      id: string;
      jobNumber: string;
      title: string;
      vehicleRegNo: string | null;
      mechanicAssigned: string | null;
    } | null;
    subtotal: number;
    discountPct: number;
    discountAmt: number;
    totalAmount: number;
    paidAmount: number;
  };
  summary: {
    labour: number;
    parts: number;
    discount: number;
    bill: number;
    revenue: number;
    cost: number;
    profit: number;
    profitPct: number;
  };
  lines: ProfitLineRow[];
};
