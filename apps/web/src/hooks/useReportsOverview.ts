"use client";

import { useEffect, useRef, useState } from "react";
import { fetchReportsOverview } from "@/lib/reports-api";
import type { ReportsOverviewResponse } from "@/types/reports";

export type UseReportsOverviewArgs = {
  from: Date;
  to: Date;
  lowStock?: number;
  topN?: number;
};

export type UseReportsOverviewResult = {
  data: ReportsOverviewResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

export function useReportsOverview(
  args: UseReportsOverviewArgs
): UseReportsOverviewResult {
  const [data, setData] = useState<ReportsOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => {
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setLoading(true);
    setError(null);

    fetchReportsOverview({
      from: args.from,
      to: args.to,
      lowStock: args.lowStock,
      topN: args.topN,
      signal: ctrl.signal,
    })
      .then((res) => {
        if (!ctrl.signal.aborted) setData(res);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string }).name === "AbortError") return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.from.getTime(), args.to.getTime(), args.lowStock, args.topN, tick]);

  return { data, loading, error, refetch: () => setTick((t) => t + 1) };
}
