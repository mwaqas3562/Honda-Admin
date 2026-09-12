import { Router } from "express";
import {
  authenticate, authorize, checkPermission, enforceShopScope,
} from "../../shared/middleware/auth.middleware";
import { Role } from "../../shared/types/role";
import { asyncHandler } from "../../shared/utils/async-handler";
import {
  createVendorHandler, deleteVendorHandler, getVendorHandler,
  listVendorsHandler, updateVendorHandler,
} from "./vendor.controller";
import {
  getVendorPurchasesHandler,
  getVendorsReportHandler,
} from "./vendor-report.controller";

export const vendorRouter = Router();

const shopRoles = [Role.SUPER_ADMIN, Role.SHOP_ADMIN, Role.STOREKEEPER, Role.JOB_CARD_MANAGER];

// Reports come before /vendors/:id so the path doesn't shadow the param route
vendorRouter.get("/vendors/report",            authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(getVendorsReportHandler));
vendorRouter.get("/vendors/:id/purchases",     authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(getVendorPurchasesHandler));

vendorRouter.get("/vendors", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(listVendorsHandler));
vendorRouter.get("/vendors/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(getVendorHandler));
vendorRouter.post("/vendors", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"), asyncHandler(createVendorHandler));
vendorRouter.put("/vendors/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"), asyncHandler(updateVendorHandler));
// DELETE blocked at permission layer for STOREKEEPER & JOB_CARD_MANAGER
vendorRouter.delete("/vendors/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("delete"), asyncHandler(deleteVendorHandler));
