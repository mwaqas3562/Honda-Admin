export type RepeatBucket = "FREQUENT" | "MONTHLY" | "OCCASIONAL";

export type RepeatCustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  visits: number;
  bikeCount: number;
  bikes: string[];
  firstVisit: string | null;
  lastVisit: string | null;
  avgGapDays: number | null;
  sinceLastDays: number | null;
  bucket: RepeatBucket;
};

export type RepeatCustomersTotals = {
  totalRepeat: number;
  frequent: number;
  monthly: number;
  occasional: number;
  avgVisits: number;
  avgGapDays: number;
};

export type RepeatCustomersResponse = {
  totals: RepeatCustomersTotals;
  customers: RepeatCustomerRow[];
};

export type BikeVisit = {
  id: string;
  jobNumber: string;
  title: string;
  status: string;
  mechanicAssigned: string | null;
  meterReading: number | null;
  totalAmount: number;
  invoiceNumber: string | null;
  invoiceTotal: number | null;
  createdAt: string;
  gapFromPrevDays: number | null;
};

export type BikeGroup = {
  regNo: string;
  vehicleType: string | null;
  engineType: string | null;
  visits: BikeVisit[];
};

export type CustomerBikeHistoryResponse = {
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    createdAt: string;
  };
  summary: {
    totalVisits: number;
    totalSpend: number;
    bikeCount: number;
    avgGapDays: number | null;
    lastVisit: string | null;
  };
  bikes: BikeGroup[];
};
