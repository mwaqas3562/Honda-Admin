"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type ToastKind = "success" | "error" | "info" | "warning";
type Toast = { id: number; kind: ToastKind; message: string };

type ToastCtx = {
  toast: (kind: ToastKind, message: string) => void;
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
  warning: (m: string) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setItems((s) => s.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, message }]);
    setTimeout(() => remove(id), kind === "error" ? 6000 : 4000);
  }, [remove]);

  const value: ToastCtx = {
    toast,
    success: (m) => toast("success", m),
    error: (m) => toast("error", m),
    info: (m) => toast("info", m),
    warning: (m) => toast("warning", m),
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: "fixed", top: 16, right: 16, zIndex: 9999,
          display: "flex", flexDirection: "column", gap: 8,
          maxWidth: 380, pointerEvents: "none",
        }}
      >
        {items.map((t) => <ToastItem key={t.id} toast={t} onClose={() => remove(t.id)} />)}
      </div>
    </Ctx.Provider>
  );
}

const COLORS: Record<ToastKind, { bg: string; border: string; fg: string; icon: string }> = {
  success: { bg: "#e8f5e9", border: "#0a7a30", fg: "#0a4a1c", icon: "✓" },
  error:   { bg: "#fde7e7", border: "#9e2020", fg: "#7a1a1a", icon: "✕" },
  info:    { bg: "#e3f2fd", border: "#0050a0", fg: "#0e3a6e", icon: "ℹ" },
  warning: { bg: "#fff4e0", border: "#b45309", fg: "#7a3e05", icon: "⚠" },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const c = COLORS[toast.kind];
  const [shown, setShown] = useState(false);
  useEffect(() => { setShown(true); }, []);
  return (
    <div
      onClick={onClose}
      style={{
        background: c.bg,
        borderLeft: `4px solid ${c.border}`,
        color: c.fg,
        padding: "10px 14px",
        borderRadius: 4,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        pointerEvents: "auto",
        opacity: shown ? 1 : 0,
        transform: shown ? "translateX(0)" : "translateX(20px)",
        transition: "opacity 200ms ease, transform 200ms ease",
        display: "flex", alignItems: "flex-start", gap: 10,
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 16, lineHeight: 1 }}>{c.icon}</span>
      <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</span>
    </div>
  );
}
