"use client";

import { useCallback, useState } from "react";
import {
  invoiceApi,
  type CreateInvoicePayload,
  type InvoiceData,
  type InvoiceListResponse,
  type PaymentData,
  type RecordPaymentPayload,
  type UpdateInvoicePayload,
} from "@/lib/api";

/* ─── useInvoiceList ─────────────────────────────────────── */
export function useInvoiceList() {
  const [state, setState] = useState<{
    data: InvoiceListResponse | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: false, error: null });

  const fetch = useCallback(async (page = 1) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await invoiceApi.list(page);
      setState({ data, loading: false, error: null });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }, []);

  return { ...state, fetch };
}

/* ─── useInvoiceSave ─────────────────────────────────────── */
export function useInvoiceSave() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<InvoiceData | null>(null);

  const save = useCallback(async (payload: CreateInvoicePayload) => {
    setSaving(true); setError(null); setSaved(null);
    try {
      const inv = await invoiceApi.create(payload);
      setSaved(inv);
      return inv;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  const update = useCallback(async (id: string, payload: UpdateInvoicePayload) => {
    setSaving(true); setError(null);
    try {
      const inv = await invoiceApi.update(id, payload);
      setSaved(inv);
      return inv;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  return { saving, error, saved, save, update };
}

/* ─── useInvoiceDelete ───────────────────────────────────── */
export function useInvoiceDelete() {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(async (id: string) => {
    setDeleting(true); setError(null);
    try {
      await invoiceApi.delete(id);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setDeleting(false);
    }
  }, []);

  return { deleting, error, remove };
}

/* ─── usePayments — invoice payment ledger ───────────────── */
export function usePayments(invoiceId: string | null) {
  const [payments, setPayments] = useState<PaymentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!invoiceId) { setPayments([]); return; }
    setLoading(true); setError(null);
    try {
      const r = await invoiceApi.listPayments(invoiceId);
      setPayments(r.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  const record = useCallback(async (payload: RecordPaymentPayload) => {
    if (!invoiceId) return null;
    setBusy(true); setError(null);
    try {
      const p = await invoiceApi.recordPayment(invoiceId, payload);
      setPayments((s) => [p, ...s]);
      return p;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }, [invoiceId]);

  return { payments, loading, busy, error, reload, record };
}
