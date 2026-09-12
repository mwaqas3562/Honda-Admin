import { API_BASE } from "@/lib/api-base";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("wpm_token");
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("wpm_token");
      localStorage.removeItem("wpm_user");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.replace("/login");
      }
    }
    throw new Error(body?.message ?? `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

/* ─── Invoice types (mirrors API response) ──────────────── */
export type InvoiceItemData = {
  id: string;
  partId: string | null;
  itemCode: string | null;
  itemName: string;
  qty: number;
  rate: string;
  total: string;
  costPrice: string;
  profit: string;
  remarks: string | null;
};

export type InvoiceData = {
  id: string;
  invoiceNumber: string;
  shopId: string;
  customerId: string;
  jobCardId: string | null;
  jobDetail: string | null;
  cellNo: string | null;
  saleTerm: string;
  subtotal: string;
  discountPct: string;
  discountAmt: string;
  totalAmount: string;
  paidAmount: string;
  status: string;
  createdAt: string;
  customer: { id: string; name: string; phone: string | null };
  shop?: { id: string; name: string; address: string | null; phone: string | null } | null;
  jobCard: {
    id: string;
    jobNumber: string;
    vehicleRegNo: string | null;
    meterReading: number | null;
    status: string;
    isFinal: boolean;
  } | null;
  items: InvoiceItemData[];
};

export type InvoiceListResponse = {
  data: InvoiceData[];
  total: number;
  page: number;
  limit: number;
};

export type CreateInvoicePayload = {
  /** Mandatory link to a non-completed Job Card. */
  jobCardId: string;
  jobDetail?: string;
  cellNo?: string;
  saleTerm?: string;
  discountPct?: number;
  paidAmount?: number;
  /** When "PAID", stock auto-deducts and the linked Job Card auto-completes. */
  status?: "DRAFT" | "PAID";
  items: {
    /** Optional Part link — required for stocked products. */
    partId?: string;
    itemCode?: string;
    itemName: string;
    qty: number;
    rate: number;
    /** Optional explicit cost-price snapshot. Otherwise pulled from Part. */
    costPrice?: number;
    remarks?: string;
  }[];
};

export type UpdateInvoicePayload = {
  jobDetail?: string;
  cellNo?: string;
  saleTerm?: string;
  discountPct?: number;
  paidAmount?: number;
  status?: "DRAFT" | "ISSUED" | "PARTIAL" | "PAID" | "VOID";
  items?: CreateInvoicePayload["items"];
};

/* ─── Invoice API calls ──────────────────────────────────── */
export const invoiceApi = {
  list: (page = 1, limit = 50, q?: string) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q && q.trim()) params.set("q", q.trim());
    return apiFetch<InvoiceListResponse>(`/invoices?${params.toString()}`);
  },

  get: (id: string) =>
    apiFetch<InvoiceData>(`/invoices/${id}`),

  create: (payload: CreateInvoicePayload) =>
    apiFetch<InvoiceData>("/invoices", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (id: string, payload: UpdateInvoicePayload) =>
    apiFetch<InvoiceData>(`/invoices/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  delete: (id: string) =>
    apiFetch<{ message: string }>(`/invoices/${id}`, { method: "DELETE" }),

  /* Payments (B1 ledger) */
  listPayments: (invoiceId: string) =>
    apiFetch<{ data: PaymentData[] }>(`/invoices/${invoiceId}/payments`),

  recordPayment: (invoiceId: string, payload: RecordPaymentPayload) =>
    apiFetch<PaymentData>(`/invoices/${invoiceId}/payments`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export type PaymentMethod = "CASH" | "CARD" | "BANK" | "ONLINE" | "OTHER";

export type PaymentData = {
  id: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  notes: string | null;
  paidAt: string;
  createdAt: string;
  createdBy: { id: string; fullName: string } | null;
};

export type RecordPaymentPayload = {
  amount: number;
  method?: PaymentMethod;
  notes?: string | null;
  paidAt?: string;
};

/* ─── Inventory: Parts ──────────────────────────────────── */
export type PartData = {
  id: string;
  shopId: string;
  name: string;
  sku: string;
  category: string | null;
  stockQty: number;
  costPrice: string;
  unitPrice: string;
  sellingPrice: string;
  minStockLevel: number;
  createdAt: string;
  updatedAt: string;
};

export type PartListResponse = {
  data: PartData[];
  total: number;
  page: number;
  limit: number;
};

export type CreatePartPayload = {
  name: string;
  sku: string;
  category?: string | null;
  stockQty?: number;
  costPrice?: number;
  unitPrice?: number;
  sellingPrice?: number;
  minStockLevel?: number;
};

export type UpdatePartPayload = Partial<CreatePartPayload>;

export const partsApi = {
  list: (page = 1, limit = 100, search?: string) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) q.set("search", search);
    return apiFetch<PartListResponse>(`/parts?${q.toString()}`);
  },
  get: (id: string) => apiFetch<PartData>(`/parts/${id}`),
  create: (payload: CreatePartPayload) =>
    apiFetch<PartData>("/parts", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: UpdatePartPayload) =>
    apiFetch<PartData>(`/parts/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
};

/* ─── Inventory: Vendors ────────────────────────────────── */
export type VendorData = {
  id: string;
  shopId: string;
  name: string;
  code: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VendorListResponse = {
  data: VendorData[];
  total: number;
  page: number;
  limit: number;
};

export type CreateVendorPayload = {
  name: string;
  code: string;
  phone?: string;
  email?: string;
  address?: string;
};

export type UpdateVendorPayload = Partial<CreateVendorPayload>;

export const vendorsApi = {
  list: (page = 1, limit = 100, search?: string) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) q.set("search", search);
    return apiFetch<VendorListResponse>(`/vendors?${q.toString()}`);
  },
  get: (id: string) => apiFetch<VendorData>(`/vendors/${id}`),
  create: (payload: CreateVendorPayload) =>
    apiFetch<VendorData>("/vendors", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: UpdateVendorPayload) =>
    apiFetch<VendorData>(`/vendors/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
};

/* ─── Mechanics master ──────────────────────────────────── */
export type MechanicStatus = "ACTIVE" | "INACTIVE";

export type MechanicData = {
  id: string;
  shopId: string;
  name: string;
  phone: string | null;
  address: string | null;
  status: MechanicStatus;
  createdAt: string;
  updatedAt: string;
  totalJobs?: number;
  completedJobs?: number;
  openJobs?: number;
  earnings?: number;
};

export type MechanicListResponse = { data: MechanicData[] };

export type CreateMechanicPayload = {
  name: string;
  phone?: string;
  address?: string;
  status?: MechanicStatus;
};

export type UpdateMechanicPayload = Partial<CreateMechanicPayload>;

export const mechanicsApi = {
  list: (opts: { status?: MechanicStatus | "ALL"; q?: string; stats?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (opts.status && opts.status !== "ALL") q.set("status", opts.status);
    if (opts.q) q.set("q", opts.q);
    if (opts.stats) q.set("stats", "1");
    const qs = q.toString();
    return apiFetch<MechanicListResponse>(`/mechanics${qs ? `?${qs}` : ""}`);
  },
  listActive: () => apiFetch<MechanicListResponse>(`/mechanics?status=ACTIVE`),
  get: (id: string) => apiFetch<MechanicData>(`/mechanics/${id}`),
  create: (payload: CreateMechanicPayload) =>
    apiFetch<MechanicData>("/mechanics", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: UpdateMechanicPayload) =>
    apiFetch<MechanicData>(`/mechanics/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  setStatus: (id: string, status: MechanicStatus) =>
    apiFetch<MechanicData>(`/mechanics/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  remove: (id: string) =>
    apiFetch<{ message: string }>(`/mechanics/${id}`, { method: "DELETE" }),
};

/* ─── Services (master list of common labour entries) ─── */
export type ServiceData = {
  id: string;
  shopId: string;
  name: string;
  defaultPrice: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateServicePayload = {
  name: string;
  defaultPrice?: number;
  description?: string;
  isActive?: boolean;
};

export type UpdateServicePayload = Partial<CreateServicePayload>;

export const servicesApi = {
  list: (opts: { q?: string; activeOnly?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (opts.q) q.set("q", opts.q);
    if (opts.activeOnly) q.set("active", "1");
    const qs = q.toString();
    return apiFetch<{ data: ServiceData[] }>(`/services${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => apiFetch<ServiceData>(`/services/${id}`),
  create: (payload: CreateServicePayload) =>
    apiFetch<ServiceData>("/services", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: UpdateServicePayload) =>
    apiFetch<ServiceData>(`/services/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  remove: (id: string) =>
    apiFetch<{ message: string }>(`/services/${id}`, { method: "DELETE" }),
};

/* ─── Inventory: Purchases (multi-line) ─────────────────── */
export type PurchaseStatus = "DRAFT" | "RECEIVED" | "PAID" | "CANCELLED";

export type PurchaseItemData = {
  id: string;
  partId: string;
  quantity: number;       // ordered
  receivedQty: number;    // actually received so far
  costPrice: string;
  totalPrice: string;     // receivedQty × costPrice
  part: { id: string; name: string; sku: string };
};

export type PurchaseData = {
  id: string;
  shopId: string;
  purchaseNo: string;
  vendorId: string;
  totalCost: string;
  status: PurchaseStatus;
  notes: string | null;
  purchasedAt: string;
  receivedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  vendor: { id: string; name: string; code: string; phone: string | null };
  items: PurchaseItemData[];
};

export type PurchaseListResponse = {
  data: PurchaseData[];
  total: number;
  page: number;
  limit: number;
};

export type PurchaseItemPayload = {
  partId: string;
  quantity: number;
  receivedQty?: number;
  costPrice: number;
};

export type ReceiveItemPayload = {
  itemId: string;
  receivedQty: number;
  costPrice?: number;
  remove?: boolean;
};

export type CreatePurchasePayload = {
  vendorId: string;
  status?: PurchaseStatus;
  notes?: string;
  items: PurchaseItemPayload[];
};

export type UpdatePurchasePayload = {
  vendorId?: string;
  status?: PurchaseStatus;
  notes?: string | null;
  items?: PurchaseItemPayload[];
};

export type PurchaseListFilters = {
  status?: PurchaseStatus;
  vendorId?: string;
  search?: string;
  from?: string;
  to?: string;
};

export type PurchaseReportsData = {
  totals: {
    countAll: number; countReceived: number; countDraft: number; countPaid: number;
    totalAll: number; totalReceived: number; totalDraft: number; totalPaid: number;
  };
  history: Array<{
    id: string; purchaseNo: string; status: PurchaseStatus;
    totalCost: number; purchasedAt: string;
    vendor: { id: string; name: string; code: string };
    itemCount: number; quantity: number; receivedQty: number;
  }>;
  topProducts: Array<{ partId: string; name: string; sku: string; quantity: number; cost: number }>;
  topVendors:  Array<{ vendorId: string; name: string; code: string; purchases: number; spend: number }>;
};

export const purchasesApi = {
  nextNumber: () => apiFetch<{ nextNumber: string }>("/purchases/next-number"),
  list: (page = 1, limit = 100, filters: PurchaseListFilters = {}) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters.status)   q.set("status", filters.status);
    if (filters.vendorId) q.set("vendorId", filters.vendorId);
    if (filters.search)   q.set("search", filters.search);
    if (filters.from)     q.set("from", filters.from);
    if (filters.to)       q.set("to", filters.to);
    return apiFetch<PurchaseListResponse>(`/purchases?${q.toString()}`);
  },
  get: (id: string) => apiFetch<PurchaseData>(`/purchases/${id}`),
  create: (payload: CreatePurchasePayload) =>
    apiFetch<PurchaseData>("/purchases", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: UpdatePurchasePayload) =>
    apiFetch<PurchaseData>(`/purchases/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  setStatus: (id: string, status: PurchaseStatus) =>
    apiFetch<PurchaseData>(`/purchases/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  receive: (id: string, items: ReceiveItemPayload[]) =>
    apiFetch<PurchaseData>(`/purchases/${id}/receive`, { method: "POST", body: JSON.stringify({ items }) }),
  remove: (id: string) =>
    apiFetch<{ message: string }>(`/purchases/${id}`, { method: "DELETE" }),
  reports: (filters: { from?: string; to?: string; vendorId?: string; partId?: string } = {}) => {
    const q = new URLSearchParams();
    if (filters.from)     q.set("from", filters.from);
    if (filters.to)       q.set("to", filters.to);
    if (filters.vendorId) q.set("vendorId", filters.vendorId);
    if (filters.partId)   q.set("partId", filters.partId);
    const qs = q.toString();
    return apiFetch<PurchaseReportsData>(`/purchases/reports${qs ? `?${qs}` : ""}`);
  },
};

/* ─── Inventory: Stock Logs (read-only) ─────────────────── */
export type StockLogData = {
  id: string;
  shopId: string;
  partId: string;
  changeQty: number;
  balanceQty: number;
  logType: "PURCHASE_IN" | "JOBCARD_OUT" | "ADJUSTMENT";
  notes: string | null;
  purchaseId: string | null;
  jobCardId: string | null;
  createdAt: string;
  part: { id: string; name: string; sku: string };
};

export type StockLogListResponse = {
  data: StockLogData[];
  total: number;
  page: number;
  limit: number;
};

export const stockLogsApi = {
  list: (
    page = 1,
    limit = 100,
    filters?: { partId?: string; logType?: "PURCHASE_IN" | "JOBCARD_OUT" | "ADJUSTMENT" }
  ) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters?.partId) q.set("partId", filters.partId);
    if (filters?.logType) q.set("logType", filters.logType);
    return apiFetch<StockLogListResponse>(`/stock-logs?${q.toString()}`);
  },
};

/* ─── Customers ─────────────────────────────────────────── */
export type CustomerData = {
  id: string;
  shopId: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerListResponse = {
  data: CustomerData[]; total: number; page: number; limit: number;
};

export type CreateCustomerPayload = {
  name: string; phone?: string; email?: string; address?: string;
};

export const customersApi = {
  list: (page = 1, limit = 200, search?: string) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) q.set("search", search);
    return apiFetch<CustomerListResponse>(`/customers?${q.toString()}`);
  },
  get: (id: string) => apiFetch<CustomerData>(`/customers/${id}`),
  create: (payload: CreateCustomerPayload) =>
    apiFetch<CustomerData>("/customers", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<CreateCustomerPayload>) =>
    apiFetch<CustomerData>(`/customers/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
};

/* ─── Job Cards ─────────────────────────────────────────── */
export type JobCardStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type JobCardData = {
  id: string;
  shopId: string;
  customerId: string;
  jobNumber: string;
  title: string;
  description: string | null;
  vehicleRegNo: string | null;
  vehicleType: string | null;
  engineType: string | null;
  meterReading: number | null;
  mechanicAssigned: string | null;
  mechanicId: string | null;
  status: JobCardStatus;
  isFinal: boolean;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string; phone: string | null };
  mechanic: { id: string; name: string; status: "ACTIVE" | "INACTIVE"; phone: string | null } | null;
  invoice: { id: string; invoiceNumber: string; status: string } | null;
};

export type JobCardListResponse = {
  data: JobCardData[]; total: number; page: number; limit: number;
};

/**
 * Create payload — supply EITHER an existing customerId OR a walk-in
 * customerName + customerPhone pair. Server creates the customer atomically.
 */
export type CreateJobCardPayload = {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  title: string;
  description?: string;
  vehicleRegNo?: string;
  vehicleType?: string;
  engineType?: string;
  meterReading?: number;
  mechanicId?: string;
  mechanicAssigned?: string;
};

/** Note: status is system-controlled; not editable from the client. */
export type UpdateJobCardPayload = {
  title?: string;
  description?: string;
  vehicleRegNo?: string;
  vehicleType?: string;
  engineType?: string;
  meterReading?: number;
  mechanicId?: string | null;
  mechanicAssigned?: string;
};

export const jobCardsApi = {
  list: (
    page = 1,
    limit = 100,
    status?: JobCardStatus,
    search?: string,
    invoiceableOnly?: boolean
  ) => {
    const q = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) q.set("status", status);
    if (search) q.set("search", search);
    if (invoiceableOnly) q.set("invoiceable", "true");
    return apiFetch<JobCardListResponse>(`/jobcards?${q.toString()}`);
  },
  get: (id: string) => apiFetch<JobCardData>(`/jobcards/${id}`),
  nextNumber: () => apiFetch<{ nextNumber: string }>("/jobcards/next-number"),
  create: (payload: CreateJobCardPayload) =>
    apiFetch<JobCardData>("/jobcards", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: UpdateJobCardPayload) =>
    apiFetch<JobCardData>(`/jobcards/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  finalize: (id: string) =>
    apiFetch<JobCardData>(`/jobcards/${id}/finalize`, {
      method: "POST",
      body: JSON.stringify({ isFinal: true }),
    }),
};

/* ─── Dashboard analytics ───────────────────────────────── */
export type DashboardData = {
  today: {
    jobsCreated: number;
    jobsCompleted: number;
    invoicesPaid: number;
    revenue: number;
    profit: number;
  };
  jobStatus: {
    open: number;
    inProgress: number;
    completed: number;
    cancelled: number;
  };
  salesTrend: { date: string; revenue: number; profit: number }[];
  lowStock: {
    id: string; name: string; sku: string;
    stockQty: number; minStockLevel: number;
  }[];
  topItems: {
    partId: string | null;
    itemName: string;
    qty: number;
    revenue: number;
    profit: number;
  }[];
  range: { days: number; from: string; to: string };
};

export const dashboardApi = {
  get: (days = 7, topN = 5) =>
    apiFetch<DashboardData>(`/reports/dashboard?days=${days}&topN=${topN}`),
};

/* ─── Inventory Management ─────────────────────────────── */
export type InventoryReportsData = {
  totals: {
    totalProducts: number;
    totalValue: number;
    potentialProfit: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
  lowStock: InventoryReportRow[];
  outOfStock: InventoryReportRow[];
};

export type InventoryReportRow = {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  stockQty: number;
  minStockLevel: number;
  costPrice: number;
  sellingPrice: number;
  value: number;
};

export type StockAdjustPayload = {
  partId: string;
  type: "ADD" | "REMOVE";
  quantity: number;
  reason: string;
};

export type BulkUploadRow = {
  sku: string;
  name: string;
  category?: string | null;
  costPrice?: number;
  sellingPrice?: number;
  stockQty?: number;
  minStockLevel?: number;
};

export type BulkUploadPayload = {
  stockMode: "OVERWRITE" | "ADD";
  rows: BulkUploadRow[];
};

export type BulkUploadResult = {
  summary: { total: number; created: number; updated: number; failed: number };
  errors: { row: number; sku: string; message: string }[];
};

export const inventoryMgmtApi = {
  reports: (topN = 50) =>
    apiFetch<InventoryReportsData>(`/inventory/reports?topN=${topN}`),
  adjust: (payload: StockAdjustPayload) =>
    apiFetch<{ message: string; part: PartData }>(`/inventory/adjust`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  bulkUpload: (payload: BulkUploadPayload) =>
    apiFetch<BulkUploadResult>(`/inventory/bulk-upload`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
