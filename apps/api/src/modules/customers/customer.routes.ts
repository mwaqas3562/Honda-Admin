import { Router } from "express";
import {
  authenticate, authorize, checkPermission, enforceShopScope,
} from "../../shared/middleware/auth.middleware";
import { Role } from "../../shared/types/role";
import { asyncHandler } from "../../shared/utils/async-handler";
import {
  createCustomerHandler, getCustomerHandler,
  listCustomersHandler, updateCustomerHandler,
} from "./customer.controller";
import {
  getCustomersReportHandler,
  getCustomerTimelineHandler,
} from "./customer-report.controller";
import {
  getCustomerBikeHistoryHandler,
  getRepeatCustomersHandler,
} from "./repeat-customers.controller";

export const customerRouter = Router();

const shopRoles = [Role.SUPER_ADMIN, Role.SHOP_ADMIN, Role.STOREKEEPER, Role.JOB_CARD_MANAGER];

// Reports come before /customers/:id so the path doesn't shadow the param route
customerRouter.get("/customers/report",       authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(getCustomersReportHandler));
customerRouter.get("/customers/repeat",       authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(getRepeatCustomersHandler));
customerRouter.get("/customers/:id/timeline", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(getCustomerTimelineHandler));
customerRouter.get("/customers/:id/bikes",    authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(getCustomerBikeHistoryHandler));

// No DELETE — customers retained for audit
customerRouter.get("/customers",     authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"),  asyncHandler(listCustomersHandler));
customerRouter.get("/customers/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"),  asyncHandler(getCustomerHandler));
customerRouter.post("/customers",    authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"), asyncHandler(createCustomerHandler));
customerRouter.put("/customers/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"), asyncHandler(updateCustomerHandler));
