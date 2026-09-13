"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUserRole } from "@/hooks/useUserRole";

const NAV_ITEMS = [
  { label: "Issue Job", href: "/dashboard/issue-job", icon: "🔧" },
  { label: "Sale Invoice", href: "/dashboard/sale-invoice", icon: "📄" },
  { label: "Parts", href: "/dashboard/parts", icon: "📦", adminOnly: true },
  { label: "Services", href: "/dashboard/services", icon: "🛠️" },
  { label: "Vendors", href: "/dashboard/vendors", icon: "🏭" },
  { label: "Purchase", href: "/dashboard/purchase", icon: "🛒" },
  { label: "Purchase Reports", href: "/dashboard/reports/purchases", icon: "📈" },
  { label: "Stock Logs", href: "/dashboard/stock-logs", icon: "📋" },
  { label: "Inventory Mgmt", href: "/dashboard/reports/inventory-management", icon: "🗃️", adminOnly: true },
  { label: "Reports", href: "/dashboard/reports", icon: "📊" },
];

export default function Sidebar() {
  const pathname = usePathname();
  /* Cost prices, margins and stock valuation live behind these two screens,
   * so they are kept to the admin roles. Hidden until the role is known, which
   * means a storekeeper never sees them flash on load. The API enforces this
   * independently — hiding a link is presentation, not protection. */
  const { isAdmin } = useUserRole();
  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <aside className="sidebar">
      {/* Logo / System title — also the way back to the analytics dashboard,
        * which has no entry of its own in the menu below. */}
      <Link
        href="/dashboard"
        className="sidebar-header"
        title="Go to Dashboard"
        style={{ display: "block", textDecoration: "none", color: "inherit", cursor: "pointer" }}
      >
        <div className="sidebar-logo">WPM</div>
        <div className="sidebar-subtitle">Workshop Manager</div>
      </Link>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">MAIN MENU</div>
        {navItems.map((item) => {
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
