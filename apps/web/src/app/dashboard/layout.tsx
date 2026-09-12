"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import { ToastProvider } from "@/components/Toast";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("wpm_token") : null;
    if (!token) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--bg-page)", color: "#1e3a5f", fontSize: 12,
      }}>
        Checking session…
      </div>
    );
  }

  return (
    <div className="erp-shell">
      <Sidebar />
      <div className="erp-main">
        <TopBar />
        <main className="erp-content">
          <ToastProvider>{children}</ToastProvider>
        </main>
      </div>
    </div>
  );
}
