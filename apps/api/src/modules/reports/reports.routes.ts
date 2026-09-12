import { Router } from "express";
import {
  authenticate,
  authorize,
  checkPermission,
  enforceShopScope,
} from "../../shared/middleware/auth.middleware";
import { Role } from "../../shared/types/role";
import { asyncHandler } from "../../shared/utils/async-handler";
import { getOverviewHandler } from "./reports.controller";
import {
  getInvoiceProfitBreakdownHandler,
  getProfitReportHandler,
} from "./profit.controller";
import { getDashboardHandler } from "./dashboard.controller";

export const reportsRouter = Router();

const allowedRoles = [Role.SUPER_ADMIN, Role.SHOP_ADMIN, Role.STOREKEEPER, Role.JOB_CARD_MANAGER];

reportsRouter.get(
  "/reports/dashboard",
  authenticate,
  enforceShopScope,
  authorize(allowedRoles),
  checkPermission("read"),
  asyncHandler(getDashboardHandler)
);

reportsRouter.get(
  "/reports/overview",
  authenticate,
  enforceShopScope,
  authorize(allowedRoles),
  checkPermission("read"),
  asyncHandler(getOverviewHandler)
);

reportsRouter.get(
  "/reports/profit",
  authenticate,
  enforceShopScope,
  authorize(allowedRoles),
  checkPermission("read"),
  asyncHandler(getProfitReportHandler)
);

reportsRouter.get(
  "/reports/profit/invoices/:id",
  authenticate,
  enforceShopScope,
  authorize(allowedRoles),
  checkPermission("read"),
  asyncHandler(getInvoiceProfitBreakdownHandler)
);
