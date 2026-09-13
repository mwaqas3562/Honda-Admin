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
  createPartHandler,
  deletePartHandler,
  getPartHandler,
  listPartsHandler,
  updatePartHandler,
} from "./parts.controller";

export const partsRouter = Router();

const shopRoles = [
  Role.SUPER_ADMIN,
  Role.SHOP_ADMIN,
  Role.STOREKEEPER,
  Role.JOB_CARD_MANAGER,
];

/* Reading parts stays open to every role — the Sale Invoice screen searches it
 * to build a bill. Editing the catalogue is admin-only, matching the Parts
 * screen being hidden from Storekeeper and Job Card Manager. Purchases adjust
 * stock through their own service, so they are unaffected. */
const catalogueAdminRoles = [Role.SUPER_ADMIN, Role.SHOP_ADMIN];

partsRouter.get("/parts", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(listPartsHandler));
partsRouter.get("/parts/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(getPartHandler));
partsRouter.post("/parts", authenticate, enforceShopScope, authorize(catalogueAdminRoles), checkPermission("write"), asyncHandler(createPartHandler));
partsRouter.put("/parts/:id", authenticate, enforceShopScope, authorize(catalogueAdminRoles), checkPermission("write"), asyncHandler(updatePartHandler));
// DELETE blocked at permission layer for STOREKEEPER & JOB_CARD_MANAGER
partsRouter.delete("/parts/:id", authenticate, enforceShopScope, authorize(catalogueAdminRoles), checkPermission("delete"), asyncHandler(deletePartHandler));
