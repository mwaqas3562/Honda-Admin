import { Router } from "express";
import {
  authenticate, authorize, checkPermission, enforceShopScope,
} from "../../shared/middleware/auth.middleware";
import { Role } from "../../shared/types/role";
import { asyncHandler } from "../../shared/utils/async-handler";
import {
  createMechanicHandler,
  deleteMechanicHandler,
  getMechanicHandler,
  listMechanicsHandler,
  setMechanicStatusHandler,
  updateMechanicHandler,
} from "./mechanic.controller";

export const mechanicRouter = Router();

const shopRoles = [Role.SUPER_ADMIN, Role.SHOP_ADMIN, Role.STOREKEEPER, Role.JOB_CARD_MANAGER];

mechanicRouter.get("/mechanics", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(listMechanicsHandler));
mechanicRouter.get("/mechanics/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(getMechanicHandler));
mechanicRouter.post("/mechanics", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"), asyncHandler(createMechanicHandler));
mechanicRouter.put("/mechanics/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"), asyncHandler(updateMechanicHandler));
mechanicRouter.patch("/mechanics/:id/status", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"), asyncHandler(setMechanicStatusHandler));
mechanicRouter.delete("/mechanics/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("delete"), asyncHandler(deleteMechanicHandler));
