import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async Express handler so any thrown / rejected error
 * is forwarded to the global error middleware (instead of crashing the process).
 */
export function asyncHandler<T extends RequestHandler>(fn: T): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
