import { Router } from "express";
import express from "express";
import {
  authenticate,
  authorize,
  checkPermission,
  enforceShopScope,
} from "../../shared/middleware/auth.middleware";
import { Role } from "../../shared/types/role";
import { asyncHandler } from "../../shared/utils/async-handler";
import {
  getInventoryReportHandler,
  getPartLedgerHandler,
} from "./inventory.controller";
import {
  adjustStockHandler,
  bulkUploadPartsHandler,
  getInventoryReportsHandler,
} from "./inventory-mgmt.controller";

export const inventoryRouter = Router();

const allRoles = [
  Role.SUPER_ADMIN,
  Role.SHOP_ADMIN,
  Role.STOREKEEPER,
  Role.JOB_CARD_MANAGER,
];

/* Inventory management exposes cost prices, margins and stock valuation, and
 * lets stock be altered by hand. Kept to the admin roles — the UI hides these
 * screens from Storekeeper and Job Card Manager, and this is what makes that
 * real rather than cosmetic.
 *
 * GET /parts is deliberately NOT restricted: the Sale Invoice screen searches
 * it to build a bill, so locking it would stop storekeepers invoicing at all. */
const adminRoles = [Role.SUPER_ADMIN, Role.SHOP_ADMIN];

inventoryRouter.get(
  "/inventory/report",
  authenticate,
  enforceShopScope,
  authorize(allRoles),
  checkPermission("read"),
  asyncHandler(getInventoryReportHandler)
);

inventoryRouter.get(
  "/inventory/parts/:id/ledger",
  authenticate,
  enforceShopScope,
  authorize(allRoles),
  checkPermission("read"),
  asyncHandler(getPartLedgerHandler)
);

inventoryRouter.get(
  "/inventory/reports",
  authenticate,
  enforceShopScope,
  authorize(adminRoles),
  checkPermission("read"),
  asyncHandler(getInventoryReportsHandler)
);

inventoryRouter.post(
  "/inventory/adjust",
  authenticate,
  enforceShopScope,
  authorize(adminRoles),
  checkPermission("write"),
  asyncHandler(adjustStockHandler)
);

inventoryRouter.post(
  "/inventory/bulk-upload",
  express.json({ limit: "25mb" }),
  authenticate,
  enforceShopScope,
  authorize(adminRoles),
  checkPermission("write"),
  asyncHandler(bulkUploadPartsHandler)
);
