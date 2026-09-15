import { Router } from "express";
import {
  authenticate,
  authorize,
  checkPermission,
  enforceShopScope,
} from "../../shared/middleware/auth.middleware";
import { Role } from "../../shared/types/role";
import { asyncHandler } from "../../shared/utils/async-handler";
import {
  createInvoiceHandler,
  deleteInvoiceHandler,
  getInvoiceHandler,
  listInvoicesHandler,
  adviceHistoryHandler,
  updateInvoiceHandler,
  listPaymentsHandler,
  createPaymentHandler,
} from "./invoice.controller";

export const invoiceRouter = Router();

const shopRoles = [Role.SUPER_ADMIN, Role.SHOP_ADMIN, Role.STOREKEEPER, Role.JOB_CARD_MANAGER];

/* Before /invoices/:id, or the literal path is swallowed by the param route. */
invoiceRouter.get(
  "/invoices/advice-history",
  authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"),
  asyncHandler(adviceHistoryHandler)
);

invoiceRouter.get(
  "/invoices",
  authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"),
  asyncHandler(listInvoicesHandler)
);

invoiceRouter.get(
  "/invoices/:id",
  authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"),
  asyncHandler(getInvoiceHandler)
);

invoiceRouter.post(
  "/invoices",
  authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"),
  asyncHandler(createInvoiceHandler)
);

invoiceRouter.put(
  "/invoices/:id",
  authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"),
  asyncHandler(updateInvoiceHandler)
);

// DELETE blocked for STOREKEEPER & JOB_CARD_MANAGER via checkPermission("delete")
invoiceRouter.delete(
  "/invoices/:id",
  authenticate, enforceShopScope, authorize(shopRoles), checkPermission("delete"),
  asyncHandler(deleteInvoiceHandler)
);

/* ── Payments (B1: ledger) ──────────────────────────── */
invoiceRouter.get(
  "/invoices/:id/payments",
  authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"),
  asyncHandler(listPaymentsHandler)
);

invoiceRouter.post(
  "/invoices/:id/payments",
  authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"),
  asyncHandler(createPaymentHandler)
);
