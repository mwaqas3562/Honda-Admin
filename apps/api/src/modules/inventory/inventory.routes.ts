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

const writeRoles = [Role.SUPER_ADMIN, Role.SHOP_ADMIN, Role.STOREKEEPER];

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
  authorize(allRoles),
  checkPermission("read"),
  asyncHandler(getInventoryReportsHandler)
);

inventoryRouter.post(
  "/inventory/adjust",
  authenticate,
  enforceShopScope,
  authorize(writeRoles),
  checkPermission("write"),
  asyncHandler(adjustStockHandler)
);

inventoryRouter.post(
  "/inventory/bulk-upload",
  express.json({ limit: "25mb" }),
  authenticate,
  enforceShopScope,
  authorize(writeRoles),
  checkPermission("write"),
  asyncHandler(bulkUploadPartsHandler)
);
