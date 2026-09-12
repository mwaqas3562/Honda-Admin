"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api-base";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message ?? `Login failed (${res.status})`);
      localStorage.setItem("wpm_token", body.accessToken);
      localStorage.setItem("wpm_user", JSON.stringify(body.user));
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg-page)",
    }}>
      <form onSubmit={submit} className="panel" style={{ width: 340, padding: 0 }}>
        <div className="panel-header">
          <span className="panel-title">Workshop Manager — Sign In</span>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="field-group">
            <span className="field-label">Email</span>
            <input
              className="erp-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field-group">
            <span className="field-label">Password</span>
            <input
              className="erp-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div style={{ color: "#9e2020", fontSize: 11, padding: 4, border: "1px solid #d4a0a0", background: "#fdecec" }}>
              {error}
            </div>
          )}
          <button className="erp-btn erp-btn-primary" disabled={loading} type="submit">
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </div>
      </form>
    </div>
  );
}
