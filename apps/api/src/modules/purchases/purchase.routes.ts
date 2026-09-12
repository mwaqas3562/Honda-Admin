import { Router } from "express";
import {
  authenticate, authorize, checkPermission, enforceShopScope,
} from "../../shared/middleware/auth.middleware";
import { Role } from "../../shared/types/role";
import { asyncHandler } from "../../shared/utils/async-handler";
import {
  createPurchaseHandler, deletePurchaseHandler, getPurchaseHandler,
  listPurchasesHandler, nextPurchaseNumberHandler, purchaseReportsHandler, receivePurchaseHandler,
  setPurchaseStatusHandler, updatePurchaseHandler,
} from "./purchase.controller";

export const purchaseRouter = Router();

const shopRoles = [Role.SUPER_ADMIN, Role.SHOP_ADMIN, Role.STOREKEEPER, Role.JOB_CARD_MANAGER];

purchaseRouter.get("/purchases/reports", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(purchaseReportsHandler));
purchaseRouter.get("/purchases/next-number", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(nextPurchaseNumberHandler));
purchaseRouter.get("/purchases", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(listPurchasesHandler));
purchaseRouter.get("/purchases/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(getPurchaseHandler));
purchaseRouter.post("/purchases", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"), asyncHandler(createPurchaseHandler));
purchaseRouter.put("/purchases/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"), asyncHandler(updatePurchaseHandler));
purchaseRouter.patch("/purchases/:id/status", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"), asyncHandler(setPurchaseStatusHandler));
purchaseRouter.post("/purchases/:id/receive", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"), asyncHandler(receivePurchaseHandler));
purchaseRouter.delete("/purchases/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("delete"), asyncHandler(deletePurchaseHandler));
