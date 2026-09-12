"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ReportNavItem = {
  label: string;
  href: string;
  icon?: string;
  /** Optional grouping label rendered above the link. */
  group?: string;
};

export const REPORT_NAV: ReportNavItem[] = [
  { group: "Overview", label: "Dashboard", href: "/dashboard/reports", icon: "📊" },

  { group: "Sales", label: "Sales Summary", href: "/dashboard/reports/sales", icon: "💰" },
  { group: "Sales", label: "Profit", href: "/dashboard/reports/profit", icon: "📈" },
  { group: "Sales", label: "Invoices", href: "/dashboard/reports/invoices", icon: "📄" },
  { group: "Sales", label: "Customers", href: "/dashboard/reports/customers", icon: "👤" },
  { group: "Sales", label: "Repeat Customers", href: "/dashboard/reports/repeat-customers", icon: "🔁" },
  { group: "Sales", label: "Daily Cash", href: "/dashboard/reports/daily-cash", icon: "💵" },

  { group: "Operations", label: "Expenses", href: "/dashboard/reports/expenses", icon: "💸" },
  { group: "Operations", label: "Job Cards", href: "/dashboard/reports/jobcards", icon: "🔧" },
  { group: "Operations", label: "Mechanics", href: "/dashboard/reports/mechanics", icon: "🧰" },

  { group: "Inventory", label: "Stock On Hand", href: "/dashboard/reports/inventory", icon: "📦" },
  { group: "Inventory", label: "Stock Movement", href: "/dashboard/reports/stock-movement", icon: "📋" },
  { group: "Inventory", label: "Purchases", href: "/dashboard/reports/purchases", icon: "🛒" },
  { group: "Inventory", label: "Vendors", href: "/dashboard/reports/vendors", icon: "🏭" },
];

export default function ReportsSidebar() {
  const pathname = usePathname();

  // Group items while preserving order
  const groups: { name: string; items: ReportNavItem[] }[] = [];
  for (const item of REPORT_NAV) {
    const name = item.group ?? "Reports";
    let g = groups.find((x) => x.name === name);
    if (!g) {
      g = { name, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }

  return (
    <aside className="w-[200px] min-w-[200px] border-r border-[var(--border)] bg-white overflow-y-auto">
      <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-panel)]">
        <div className="text-[12px] font-semibold text-[var(--text-main)]">
          Reports
        </div>
        <div className="text-[10px] text-[var(--text-muted)]">
          Insights & analytics
        </div>
      </div>

      <nav className="py-2">
        {groups.map((g) => (
          <div key={g.name} className="mb-2">
            <div className="px-3 pt-1 pb-1 text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
              {g.name}
            </div>
            {g.items.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard/reports" &&
                  pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex items-center gap-2 px-3 py-1.5 text-[11px] border-l-2 transition-colors",
                    isActive
                      ? "bg-[var(--bg-table-head)] text-[var(--accent)] border-[var(--accent)] font-semibold"
                      : "text-[var(--text-main)] border-transparent hover:bg-[var(--bg-table-head)]",
                  ].join(" ")}
                >
                  <span aria-hidden className="w-4 text-center">
                    {item.icon ?? "•"}
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
