"use client";

import { useEffect, useState } from "react";

export type UserRole =
  | "SUPER_ADMIN"
  | "SHOP_ADMIN"
  | "STOREKEEPER"
  | "JOB_CARD_MANAGER";

const DELETE_ROLES = new Set<UserRole>(["SUPER_ADMIN", "SHOP_ADMIN"]);

function readRole(): UserRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("wpm_user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { role?: UserRole } | null;
    return parsed?.role ?? null;
  } catch {
    return null;
  }
}

/**
 * Hook returning the current user's role plus convenience flags for
 * permission-gated UI. Hydration-safe: returns `null` on first render
 * server-side, then updates on the client.
 */
export function useUserRole(): {
  role: UserRole | null;
  canDelete: boolean;
  isAdmin: boolean;
} {
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    setRole(readRole());

    function onStorage(e: StorageEvent) {
      if (e.key === "wpm_user") setRole(readRole());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return {
    role,
    canDelete: role !== null && DELETE_ROLES.has(role),
    isAdmin: role !== null && DELETE_ROLES.has(role),
  };
}
