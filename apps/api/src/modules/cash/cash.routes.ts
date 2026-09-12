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
  createCashEntryHandler,
  deleteCashEntryHandler,
  getCashEntriesByDayHandler,
  listCashEntriesHandler,
  updateCashEntryHandler,
} from "./cash.controller";

export const cashRouter = Router();

const allRoles = [
  Role.SUPER_ADMIN,
  Role.SHOP_ADMIN,
  Role.STOREKEEPER,
  Role.JOB_CARD_MANAGER,
];
const adminRoles = [Role.SUPER_ADMIN, Role.SHOP_ADMIN];

cashRouter.get(
  "/cash-entries",
  authenticate,
  enforceShopScope,
  authorize(allRoles),
  checkPermission("read"),
  asyncHandler(listCashEntriesHandler)
);

cashRouter.get(
  "/cash-entries/by-day/:date",
  authenticate,
  enforceShopScope,
  authorize(allRoles),
  checkPermission("read"),
  asyncHandler(getCashEntriesByDayHandler)
);

cashRouter.post(
  "/cash-entries",
  authenticate,
  enforceShopScope,
  authorize(allRoles),
  checkPermission("write"),
  asyncHandler(createCashEntryHandler)
);

cashRouter.put(
  "/cash-entries/:id",
  authenticate,
  enforceShopScope,
  authorize(allRoles),
  checkPermission("write"),
  asyncHandler(updateCashEntryHandler)
);

// Delete restricted to admin roles only (Storekeeper / Job Card Manager blocked).
cashRouter.delete(
  "/cash-entries/:id",
  authenticate,
  enforceShopScope,
  authorize(adminRoles),
  checkPermission("delete"),
  asyncHandler(deleteCashEntryHandler)
);
