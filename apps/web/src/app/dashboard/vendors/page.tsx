"use client";

import { useEffect, useState } from "react";
import { useVendors } from "@/hooks/useInventory";
import type { VendorData } from "@/lib/api";

type FormState = {
  id: string | null;
  name: string;
  code: string;
  phone: string;
  email: string;
  address: string;
};

const empty: FormState = { id: null, name: "", code: "", phone: "", email: "", address: "" };

export default function VendorsPage() {
  const { data, loading, error, saving, fetch, create, update } = useVendors();
  const [form, setForm] = useState<FormState>(empty);
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { fetch(1, 100); }, [fetch]);

  function pickRow(v: VendorData) {
    setForm({
      id: v.id,
      name: v.name,
      code: v.code,
      phone: v.phone ?? "",
      email: v.email ?? "",
      address: v.address ?? "",
    });
    setMsg(null);
  }

  function reset() { setForm(empty); setMsg(null); }

  async function save() {
    setMsg(null);
    if (!form.name.trim() || !form.code.trim()) { setMsg("Name and Code are required."); return; }
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
    };
    const r = form.id ? await update(form.id, payload) : await create(payload);
    if (r) { setMsg(form.id ? "Vendor updated." : "Vendor created."); reset(); fetch(1, 100); }
  }

  const rows = (data?.data ?? []).filter((v) =>
    !search ||
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ flex: "0 0 360px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="panel">
          <div className="panel-header"><span className="panel-title">Vendor Information</span></div>
          <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <Field label="Vendor Name">
              <input className="erp-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Vendor Code">
              <input className="erp-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header"><span className="panel-title">Contact Details</span></div>
          <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <Field label="Phone">
              <input className="erp-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="erp-input" type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Address">
              <input className="erp-input" value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <button className="erp-btn erp-btn-primary" disabled={saving} onClick={save}>
            {saving ? "Saving…" : form.id ? "Update Vendor" : "Add Vendor"}
          </button>
          <button className="erp-btn erp-btn-default" onClick={reset}>Clear</button>
        </div>

        {msg && <div style={{ color: "#0050a0", fontSize: 11 }}>{msg}</div>}
        {error && <div style={{ color: "#9e2020", fontSize: 11 }}>{error}</div>}
      </div>

      <div className="panel" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div className="panel-header" style={{ gap: 8 }}>
          <span className="panel-title">Vendors List ({data?.total ?? 0})</span>
          <input
            className="erp-input"
            placeholder="Search…"
            style={{ maxWidth: 200, height: 22 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ overflow: "auto" }}>
          <table className="erp-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Code</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="table-empty">Loading…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={5} className="table-empty">No vendors.</td></tr>}
              {rows.map((v, i) => (
                <tr key={v.id} onClick={() => pickRow(v)} style={{ cursor: "pointer" }}>
                  <td>{i + 1}</td>
                  <td>{v.code}</td>
                  <td>{v.name}</td>
                  <td>{v.phone ?? "-"}</td>
                  <td>{v.email ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field-group">
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}
