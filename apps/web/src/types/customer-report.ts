export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  visits: number;
  invoiceCount: number;
  jobCount: number;
  totalSpend: number;
  lastVisit: string | null;
  createdAt: string;
};

export type CustomersReportTotals = {
  totalCustomers: number;
  totalRevenue: number;
  avgSpend: number;
  payingCustomers: number;
};

export type CustomersReportResponse = {
  totals: CustomersReportTotals;
  customers: CustomerRow[];
};

export type TimelineKind = "SALE" | "SERVICE" | "JOB_CARD";

export type TimelineEntry =
  | {
      kind: "SALE" | "SERVICE";
      id: string;
      date: string;
      invoiceNumber: string;
      status: string;
      totalAmount: number;
      paidAmount: number;
      jobNumber: string | null;
      jobTitle: string | null;
    }
  | {
      kind: "JOB_CARD";
      id: string;
      date: string;
      jobNumber: string;
      title: string;
      status: string;
      totalAmount: number;
      vehicleRegNo: string | null;
      mechanicAssigned: string | null;
    };

export type CustomerTimelineResponse = {
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    createdAt: string;
  };
  summary: {
    salesCount: number;
    serviceCount: number;
    jobCardCount: number;
    totalSpend: number;
  };
  entries: TimelineEntry[];
};
