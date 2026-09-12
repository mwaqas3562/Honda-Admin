"use client";

import { useCallback, useState } from "react";
import {
  jobCardsApi,
  customersApi,
  type JobCardData,
  type JobCardListResponse,
  type JobCardStatus,
  type CreateJobCardPayload,
  type UpdateJobCardPayload,
  type CustomerData,
  type CustomerListResponse,
  type CreateCustomerPayload,
} from "@/lib/api";

export function useJobCards() {
  const [data, setData] = useState<JobCardListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(
    async (
      page = 1,
      limit = 100,
      status?: JobCardStatus,
      search?: string,
      invoiceableOnly?: boolean
    ) => {
      setLoading(true); setError(null);
      try {
        const r = await jobCardsApi.list(page, limit, status, search, invoiceableOnly);
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

  const create = useCallback(async (payload: CreateJobCardPayload): Promise<JobCardData | null> => {
    setSaving(true); setError(null);
    try { return await jobCardsApi.create(payload); }
    catch (e) { setError((e as Error).message); return null; }
    finally { setSaving(false); }
  }, []);

  const update = useCallback(
    async (id: string, payload: UpdateJobCardPayload): Promise<JobCardData | null> => {
      setSaving(true); setError(null);
      try { return await jobCardsApi.update(id, payload); }
      catch (e) { setError((e as Error).message); return null; }
      finally { setSaving(false); }
    },
    []
  );

  const finalize = useCallback(async (id: string): Promise<JobCardData | null> => {
    setSaving(true); setError(null);
    try { return await jobCardsApi.finalize(id); }
    catch (e) { setError((e as Error).message); return null; }
    finally { setSaving(false); }
  }, []);

  return { data, loading, saving, error, fetch, create, update, finalize };
}

export function useCustomers() {
  const [data, setData] = useState<CustomerListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (page = 1, limit = 200, search?: string) => {
    setLoading(true); setError(null);
    try {
      const r = await customersApi.list(page, limit, search);
      setData(r);
      return r;
    } catch (e) { setError((e as Error).message); return null; }
    finally { setLoading(false); }
  }, []);

  const create = useCallback(async (payload: CreateCustomerPayload): Promise<CustomerData | null> => {
    setSaving(true); setError(null);
    try { return await customersApi.create(payload); }
    catch (e) { setError((e as Error).message); return null; }
    finally { setSaving(false); }
  }, []);

  return { data, loading, saving, error, fetch, create };
}
