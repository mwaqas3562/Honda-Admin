"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type StoredUser = { id: string; email: string; fullName: string; role: string; shopId: string | null };

export default function TopBar() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const raw = localStorage.getItem("wpm_user");
    if (raw) {
      try { setUser(JSON.parse(raw)); } catch { /* ignore */ }
    }
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  function logout() {
    localStorage.removeItem("wpm_token");
    localStorage.removeItem("wpm_user");
    router.replace("/login");
  }

  const dateStr = now.toLocaleDateString("en-MY", {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-system-name">Honda Workshop — Planning &amp; Management System</span>
      </div>

      <div className="topbar-right">
        <span className="topbar-date">{dateStr} {timeStr}</span>
        <div className="topbar-divider" />
        <div className="topbar-user">
          <span className="topbar-user-icon">👤</span>
          <span className="topbar-user-name">{user?.fullName ?? user?.email ?? "Guest"}</span>
        </div>
        <div className="topbar-divider" />
        <button className="topbar-btn" type="button" onClick={logout}>
          Logout
        </button>
      </div>
    </header>
  );
}
