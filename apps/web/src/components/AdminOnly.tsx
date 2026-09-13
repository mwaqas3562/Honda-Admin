"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useUserRole } from "@/hooks/useUserRole";

/**
 * Renders children only for SUPER_ADMIN / SHOP_ADMIN, and sends anyone else
 * back to the dashboard.
 *
 * This is a wrapper rather than a guard clause inside the page on purpose: an
 * early `return` placed above a page's own hooks changes hook order between
 * renders and React throws. Keeping the check in a parent means the guarded
 * page's hooks simply never run when access is denied.
 *
 * Presentation only — the API enforces the same restriction, which is what
 * actually protects the data.
 */
export default function AdminOnly({
  children,
  redirectTo = "/dashboard",
}: {
  children: ReactNode;
  redirectTo?: string;
}) {
  const { role, isAdmin } = useUserRole();
  const router = useRouter();

  useEffect(() => {
    if (role !== null && !isAdmin) router.replace(redirectTo);
  }, [role, isAdmin, router, redirectTo]);

  // Role not read yet — render nothing rather than flashing restricted content.
  if (role === null) return null;

  if (!isAdmin) {
    return (
      <div className="page-wrapper">
        <div className="page-header">
          <h1 className="page-title">Not available</h1>
          <span className="page-subtitle">
            This section is restricted to administrators.
          </span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
