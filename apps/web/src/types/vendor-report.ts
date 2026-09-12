export type PurchaseStatusValue = "DRAFT" | "RECEIVED" | "PAID" | "CANCELLED";

export type VendorRow = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  email: string | null;
  purchases: number;
  received: number;
  draft: number;
  cancelled: number;
  quantity: number;
  totalSpend: number;
  receivedSpend: number;
  draftSpend: number;
  lastPurchase: string | null;
};

export type VendorsReportResponse = {
  totals: {
    vendorCount: number;
    activeVendors: number;
    purchaseCount: number;
    totalSpend: number;
    receivedSpend: number;
    draftSpend: number;
  };
  vendors: VendorRow[];
};

export type VendorPurchaseItem = {
  id: string;
  quantity: number;
  costPrice: number;
  totalPrice: number;
  part: { id: string; name: string; sku: string };
};

export type VendorPurchase = {
  id: string;
  purchaseNo: string;
  quantity: number;
  totalCost: number;
  status: PurchaseStatusValue;
  purchasedAt: string;
  items: VendorPurchaseItem[];
};

export type VendorPurchasesResponse = {
  vendor: {
    id: string;
    name: string;
    code: string;
    phone: string | null;
    email: string | null;
  };
  summary: {
    purchaseCount: number;
    totalSpend: number;
    receivedSpend: number;
    totalQuantity: number;
  };
  purchases: VendorPurchase[];
};
