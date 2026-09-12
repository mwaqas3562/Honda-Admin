import type { ReactNode } from "react";
import ReportsSidebar from "@/components/reports/ReportsSidebar";

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[calc(100vh-var(--topbar-h))] bg-[var(--bg-page)]">
      <ReportsSidebar />
      <div className="flex-1 overflow-auto p-3">{children}</div>
    </div>
  );
}
