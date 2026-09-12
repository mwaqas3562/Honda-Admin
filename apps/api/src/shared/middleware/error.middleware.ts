import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { BusinessError } from "../errors/business-error";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ message: "Route not found." });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // Log full error server-side for diagnostics
  // eslint-disable-next-line no-console
  console.error("[errorHandler]", err);

  /* Domain errors → 400 with the original message (safe to expose). */
  if (err instanceof BusinessError) {
    res.status(err.status).json({ message: err.message });
    return;
  }

  /* Zod validation failures → 400. */
  if (err instanceof ZodError) {
    res.status(400).json({
      message: "Validation failed",
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  /* Prisma connectivity / init issues → 503. */
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    if (typeof code === "string" && code.startsWith("P1")) {
      res.status(503).json({ message: "Database is unavailable. Please try again shortly." });
      return;
    }
  }

  /* Everything else: hide implementation detail. The full error is logged above. */
  res.status(500).json({ message: "Internal server error." });
}
