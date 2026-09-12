"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Issue Job", href: "/dashboard/issue-job", icon: "🔧" },
  { label: "Sale Invoice", href: "/dashboard/sale-invoice", icon: "📄" },
  { label: "Parts", href: "/dashboard/parts", icon: "📦" },
  { label: "Services", href: "/dashboard/services", icon: "🛠️" },
  { label: "Vendors", href: "/dashboard/vendors", icon: "🏭" },
  { label: "Purchase", href: "/dashboard/purchase", icon: "🛒" },
  { label: "Purchase Reports", href: "/dashboard/reports/purchases", icon: "📈" },
  { label: "Stock Logs", href: "/dashboard/stock-logs", icon: "📋" },
  { label: "Inventory Mgmt", href: "/dashboard/reports/inventory-management", icon: "🗃️" },
  { label: "Reports", href: "/dashboard/reports", icon: "📊" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      {/* Logo / System title */}
      <div className="sidebar-header">
        <div className="sidebar-logo">WPM</div>
        <div className="sidebar-subtitle">Workshop Manager</div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">MAIN MENU</div>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${isActive ? " active" : ""}`}
            >
              <span className="sidebar-link-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <span>Honda WPM v1.0</span>
      </div>
    </aside>
  );
}
