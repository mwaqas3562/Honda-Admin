"use client";

import { useCallback, useState } from "react";
import {
  partsApi,
  vendorsApi,
  purchasesApi,
  stockLogsApi,
  type PartData,
  type PartListResponse,
  type CreatePartPayload,
  type UpdatePartPayload,
  type VendorData,
  type VendorListResponse,
  type CreateVendorPayload,
  type UpdateVendorPayload,
  type PurchaseData,
  type PurchaseListResponse,
  type CreatePurchasePayload,
  type UpdatePurchasePayload,
  type StockLogListResponse,
} from "@/lib/api";

/* ─── Generic CRUD hook builder ─────────────────────────── */
function useResource<TList, TCreate, TUpdate, TItem>(api: {
  list: (...args: never[]) => Promise<TList>;
  create: (payload: TCreate) => Promise<TItem>;
  update: (id: string, payload: TUpdate) => Promise<TItem>;
}) {
  const [data, setData] = useState<TList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async (...args: unknown[]) => {
    setLoading(true); setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = await (api.list as any)(...args);
      setData(r);
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [api]);

  const create = useCallback(async (payload: TCreate) => {
    setSaving(true); setError(null);
    try { return await api.create(payload); }
    catch (e) { setError((e as Error).message); return null; }
    finally { setSaving(false); }
  }, [api]);

  const update = useCallback(async (id: string, payload: TUpdate) => {
    setSaving(true); setError(null);
    try { return await api.update(id, payload); }
    catch (e) { setError((e as Error).message); return null; }
    finally { setSaving(false); }
  }, [api]);

  return { data, loading, error, saving, fetch, create, update };
}

/* ─── Parts ─────────────────────────────────────────────── */
export function useParts() {
  return useResource<PartListResponse, CreatePartPayload, UpdatePartPayload, PartData>(partsApi);
}

/* ─── Vendors ───────────────────────────────────────────── */
export function useVendors() {
  return useResource<VendorListResponse, CreateVendorPayload, UpdateVendorPayload, VendorData>(vendorsApi);
}

/* ─── Purchases ─────────────────────────────────────────── */
export function usePurchases() {
  return useResource<PurchaseListResponse, CreatePurchasePayload, UpdatePurchasePayload, PurchaseData>(purchasesApi);
}

/* ─── Stock Logs (read-only) ────────────────────────────── */
export function useStockLogs() {
  const [data, setData] = useState<StockLogListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(
    async (
      page = 1,
      limit = 100,
      filters?: { partId?: string; logType?: "PURCHASE_IN" | "JOBCARD_OUT" | "ADJUSTMENT" }
    ) => {
      setLoading(true); setError(null);
      try {
        const r = await stockLogsApi.list(page, limit, filters);
        setData(r);
        return r;
      } catch (e) {
        setError((e as Error).message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { data, loading, error, fetch };
}
