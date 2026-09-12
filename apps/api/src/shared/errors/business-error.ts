/**
 * Domain-level error: a recoverable, user-facing business-rule violation.
 * Mapped to HTTP 400 by the global error middleware. Use this in services
 * for things like "insufficient stock", "job not finalised", "invalid status
 * transition", etc. — anything the user can fix or react to.
 */
export class BusinessError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "BusinessError";
    this.status = status;
  }
}
