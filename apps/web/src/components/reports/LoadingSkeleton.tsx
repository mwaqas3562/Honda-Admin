"use client";

export type LoadingSkeletonProps = {
  /** Render mode. */
  variant?: "table" | "cards" | "lines";
  /** Number of rows / cards / lines. */
  rows?: number;
  /** Number of columns (table variant only). */
  columns?: number;
  className?: string;
};

export default function LoadingSkeleton({
  variant = "table",
  rows = 6,
  columns = 5,
  className = "",
}: LoadingSkeletonProps) {
  if (variant === "cards") {
    return (
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 ${className}`}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="border border-[var(--border)] bg-white rounded-sm p-3 animate-pulse"
          >
            <div className="h-3 w-1/2 bg-gray-200 rounded mb-2" />
            <div className="h-6 w-3/4 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "lines") {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-3 bg-gray-200 rounded animate-pulse"
            style={{ width: `${60 + ((i * 13) % 35)}%` }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`border border-[var(--border)] bg-white ${className}`}>
      <div className="grid bg-[var(--bg-table-head)] border-b border-[var(--border)]"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="px-2 py-1.5">
            <div className="h-2.5 bg-gray-300/60 rounded animate-pulse" />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="grid border-b border-[var(--border)] last:border-b-0"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, c) => (
            <div key={c} className="px-2 py-2">
              <div
                className="h-2.5 bg-gray-200 rounded animate-pulse"
                style={{ width: `${50 + ((r * 7 + c * 11) % 45)}%` }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
