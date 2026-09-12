import { Router } from "express";
import {
  authenticate, authorize, checkPermission, enforceShopScope,
} from "../../shared/middleware/auth.middleware";
import { Role } from "../../shared/types/role";
import { asyncHandler } from "../../shared/utils/async-handler";
import { listStockLogsHandler } from "./stock-log.controller";

export const stockLogRouter = Router();

const shopRoles = [Role.SUPER_ADMIN, Role.SHOP_ADMIN, Role.STOREKEEPER, Role.JOB_CARD_MANAGER];

// Read-only: stock logs are audit records — no create/update/delete endpoints exposed
stockLogRouter.get(
  "/stock-logs",
  authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"),
  asyncHandler(listStockLogsHandler)
);
