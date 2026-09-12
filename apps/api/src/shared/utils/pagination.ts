import type { Request } from "express";

/**
 * Parse `?page` and `?limit` query parameters with sane defaults and a hard
 * upper bound to prevent DOS via huge result sets.
 */
export function parsePagination(req: Request, defaultLimit = 50, maxLimit = 500) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const raw = Number(req.query.limit) || defaultLimit;
  const limit = Math.max(1, Math.min(maxLimit, raw));
  return { page, limit };
}
