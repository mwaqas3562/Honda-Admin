"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useUserRole } from "@/hooks/useUserRole";
import { servicesApi, type ServiceData } from "@/lib/api";

type FormState = {
  name: string;
  defaultPrice: number;
  description: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  defaultPrice: 0,
  description: "",
  isActive: true,
};

export default function ServicesPage() {
  const toast = useToast();
  const { canDelete } = useUserRole();

  const [rows, setRows] = useState<ServiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reloadTick, setReloadTick] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ServiceData | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    servicesApi
      .list({ q: search.trim() || undefined })
      .then((r) => { if (!cancelled) setRows(r.data); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load services.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, reloadTick]);

  const refresh = useCallback(() => setReloadTick((t) => t + 1), []);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (s: ServiceData) => {
    setEditing(s);
    setForm({
      name: s.name,
      defaultPrice: s.defaultPrice,
      description: s.description ?? "",
      isActive: s.isActive,
    });
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Name is required."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        defaultPrice: Math.max(0, Math.floor(Number(form.defaultPrice) || 0)),
        description: form.description.trim() || undefined,
        isActive: form.isActive,
      };
      if (editing) await servicesApi.update(editing.id, payload);
      else await servicesApi.create(payload);
      toast.success(editing ? "Service updated." : "Service created.");
      closeForm();
      refresh();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to save service.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: ServiceData) => {
    if (!confirm(`Delete service "${s.name}"?`)) return;
    try {
      await servicesApi.remove(s.id);
      toast.success("Service deleted.");
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete.");
    }
  };

  const toggleActive = async (s: ServiceData) => {
    try {
      await servicesApi.update(s.id, { isActive: !s.isActive });
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update.");
    }
  };

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Services</h1>
          <p className="text-[12px] text-gray-600">
            Master list of common labour entries (e.g. Engine Tuning, Oil Change).
            Used as a quick-pick when adding labour to a Sale Invoice.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
        >
          + Add Service
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          className="erp-input"
          style={{ width: 280 }}
          placeholder="Search by name or description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <div className="rounded bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>
      )}

      <table className="erp-table w-full">
        <thead>
          <tr>
            <th>Name</th>
            <th className="text-right" style={{ width: 110 }}>Default Price</th>
            <th>Description</th>
            <th style={{ width: 90 }}>Status</th>
            <th style={{ width: 180 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} style={{ padding: 12, color: "#888" }}>Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={5} style={{ padding: 12, color: "#888" }}>
              No services yet. Click "+ Add Service" to create one.
            </td></tr>
          ) : (
            rows.map((s) => (
              <tr key={s.id} style={{ opacity: s.isActive ? 1 : 0.55 }}>
                <td style={{ fontWeight: 600 }}>{s.name}</td>
                <td className="text-right">{s.defaultPrice}</td>
                <td>{s.description ?? "—"}</td>
                <td>
                  <span style={{
                    display: "inline-block", padding: "2px 6px", borderRadius: 3,
                    fontSize: 10, fontWeight: 700,
                    background: s.isActive ? "#d4edda" : "#e2e3e5",
                    color: s.isActive ? "#155724" : "#383d41",
                  }}>
                    {s.isActive ? "ACTIVE" : "INACTIVE"}
                  </span>
                </td>
                <td>
                  <button className="erp-btn erp-btn-secondary"
                    style={{ marginRight: 4 }} onClick={() => openEdit(s)}>Edit</button>
                  <button className="erp-btn"
                    style={{ marginRight: 4 }} onClick={() => toggleActive(s)}>
                    {s.isActive ? "Deactivate" : "Activate"}
                  </button>
                  {canDelete && (
                    <button className="erp-btn-danger-sm" onClick={() => remove(s)}>✕</button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {showForm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
        }}>
          <form
            onSubmit={submitForm}
            style={{
              background: "#fff", borderRadius: 6, padding: 16,
              width: 480, maxWidth: "90vw", boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            }}
          >
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
              {editing ? "Edit Service" : "Add Service"}
            </h2>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
                Name *
              </label>
              <input
                className="erp-input" style={{ width: "100%" }}
                value={form.name} autoFocus
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Engine Tuning"
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
                Default Price (Rs.)
              </label>
              <input
                className="erp-input" style={{ width: 160 }} type="number" min={0} step={1}
                value={form.defaultPrice}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setForm((p) => ({ ...p, defaultPrice: Number(e.target.value) }))}
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
                Description
              </label>
              <textarea
                className="erp-input" style={{ width: "100%", minHeight: 60 }}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600 }}>
                <input type="checkbox" checked={form.isActive}
                  onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                  style={{ marginRight: 6 }}
                />
                Active (show in Sale Invoice picker)
              </label>
            </div>

            {formError && (
              <div style={{
                padding: "6px 10px", background: "#fde2e2", color: "#9e2020",
                fontSize: 11, borderRadius: 3, marginBottom: 8,
              }}>{formError}</div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <button type="button" className="erp-btn" onClick={closeForm} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="erp-btn erp-btn-primary" disabled={saving}>
                {saving ? "Saving…" : editing ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
