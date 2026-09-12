"use client";

import { useCallback, useState } from "react";

export type SortDir = "asc" | "desc";

export type UseSortControlOptions<TKey extends string> = {
  defaultKey: TKey;
  defaultDir?: SortDir;
  /**
   * Optional helper: returns the desired direction when switching to a new
   * key. Use to default numeric/recency keys to "desc" and string keys to
   * "asc" without having to special-case each call site.
   */
  resolveDirForKey?: (key: TKey) => SortDir;
};

export type UseSortControlResult<TKey extends string> = {
  sortBy: TKey;
  sortDir: SortDir;
  /** Click handler to set or toggle sort. Stable identity. */
  toggleSort: (key: TKey) => void;
  /** Imperative setters when needed. */
  setSortBy: (key: TKey) => void;
  setSortDir: (dir: SortDir) => void;
};

/**
 * Manages a (sortBy, sortDir) pair with the standard "click same column to
 * flip direction; click new column to switch and reset direction" behaviour.
 */
export function useSortControl<TKey extends string>(
  options: UseSortControlOptions<TKey>
): UseSortControlResult<TKey> {
  const { defaultKey, defaultDir = "desc", resolveDirForKey } = options;
  const [sortBy, setSortBy] = useState<TKey>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const toggleSort = useCallback(
    (key: TKey) => {
      setSortBy((current) => {
        if (current === key) {
          setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          return current;
        }
        setSortDir(resolveDirForKey ? resolveDirForKey(key) : defaultDir);
        return key;
      });
    },
    [defaultDir, resolveDirForKey]
  );

  return { sortBy, sortDir, toggleSort, setSortBy, setSortDir };
}
