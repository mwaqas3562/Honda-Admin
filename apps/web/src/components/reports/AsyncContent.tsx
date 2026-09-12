"use client";

import type { ReactNode } from "react";
import EmptyState, { ErrorState } from "./EmptyState";
import LoadingSkeleton from "./LoadingSkeleton";

export type AsyncContentProps<T> = {
  loading: boolean;
  error: string | null;
  /** The value to render when ready. Treated as "empty" if it's falsy or an empty array. */
  data: T | null | undefined;
  /** Override empty-state detection. */
  isEmpty?: (data: T) => boolean;
  emptyMessage?: string;
  onRetry?: () => void;
  /** Skeleton row count while loading. */
  skeletonRows?: number;
  /** Padding around state placeholders (loading/error/empty). Defaults to "p-4". */
  statePadding?: string;
  children: (data: T) => ReactNode;
};

function defaultIsEmpty(data: unknown): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0;
  return false;
}

/**
 * Renders one of: error → loading skeleton → empty state → children(data).
 * Centralises the load/empty/error pattern that was duplicated across reports.
 */
export default function AsyncContent<T>({
  loading,
  error,
  data,
  isEmpty,
  emptyMessage = "No data for the current filters.",
  onRetry,
  skeletonRows = 6,
  statePadding = "p-4",
  children,
}: AsyncContentProps<T>) {
  if (error) {
    return (
      <div className={statePadding}>
        <ErrorState message={error} onRetry={onRetry} />
      </div>
    );
  }
  if (loading && (data === null || data === undefined)) {
    return (
      <div className={statePadding}>
        <LoadingSkeleton rows={skeletonRows} />
      </div>
    );
  }
  if (data === null || data === undefined) {
    return null;
  }
  const empty = (isEmpty ?? defaultIsEmpty)(data);
  if (empty) {
    return (
      <div className={statePadding}>
        <EmptyState description={emptyMessage} />
      </div>
    );
  }
  return <>{children(data)}</>;
}
