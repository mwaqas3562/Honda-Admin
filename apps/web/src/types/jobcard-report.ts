export type JobCardStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type JobCardReportRow = {
  id: string;
  jobNumber: string;
  title: string;
  status: JobCardStatus;
  vehicleRegNo: string | null;
  mechanicAssigned: string | null;
  createdAt: string;
  updatedAt: string;
  labour: number;
  parts: number;
  total: number;
  ageDays: number;
  turnaroundDays: number | null;
  customer: { id: string; name: string; phone: string | null };
  invoice: { id: string; invoiceNumber: string; status: string; paidAt: string | null } | null;
};

export type JobCardReportTotals = {
  jobCount: number;
  open: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  wipValue: number;
  completedValue: number;
  totalLabour: number;
  totalParts: number;
  avgTurnaroundDays: number | null;
};

export type JobCardsReportResponse = {
  totals: JobCardReportTotals;
  jobCards: JobCardReportRow[];
  mechanics: string[];
};

export type MechanicRow = {
  id: string;
  name: string;
  phone: string | null;
  status: "ACTIVE" | "INACTIVE";
  jobs: number;
  completed: number;
  open: number;
  revenue: number;
  labour: number;
  earnings: number;
  parts: number;
  avgTurnaroundDays: number | null;
};

export type MechanicsReportResponse = {
  totals: {
    mechanics: number;
    totalJobs: number;
    totalRevenue: number;
    totalCompleted: number;
    totalOpen: number;
  };
  mechanics: MechanicRow[];
};

export type MechanicJob = {
  id: string;
  jobNumber: string;
  title: string;
  status: JobCardStatus;
  vehicleRegNo: string | null;
  createdAt: string;
  updatedAt: string;
  labour: number;
  parts: number;
  total: number;
  turnaroundDays: number | null;
  customer: { id: string; name: string; phone: string | null };
};

export type MechanicJobsResponse = {
  mechanic: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    status: "ACTIVE" | "INACTIVE";
    createdAt: string;
    jobCount: number;
    totalEarnings: number;
    totalLabour: number;
    totalParts: number;
    totalSale: number;
    from: string | null;
    to: string | null;
  };
  jobs: MechanicJob[];
};
