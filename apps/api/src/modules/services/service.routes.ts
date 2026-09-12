import { Router } from "express";
import {
  authenticate, authorize, checkPermission, enforceShopScope,
} from "../../shared/middleware/auth.middleware";
import { Role } from "../../shared/types/role";
import { asyncHandler } from "../../shared/utils/async-handler";
import {
  createServiceHandler,
  deleteServiceHandler,
  getServiceHandler,
  listServicesHandler,
  updateServiceHandler,
} from "./service.controller";

export const serviceRouter = Router();

const shopRoles = [Role.SUPER_ADMIN, Role.SHOP_ADMIN, Role.STOREKEEPER, Role.JOB_CARD_MANAGER];

serviceRouter.get("/services", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(listServicesHandler));
serviceRouter.get("/services/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(getServiceHandler));
serviceRouter.post("/services", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"), asyncHandler(createServiceHandler));
serviceRouter.put("/services/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"), asyncHandler(updateServiceHandler));
serviceRouter.delete("/services/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("delete"), asyncHandler(deleteServiceHandler));
