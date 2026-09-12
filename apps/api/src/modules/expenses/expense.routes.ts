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
  createExpenseHandler,
  deleteExpenseHandler,
  listExpensesHandler,
  updateExpenseHandler,
} from "./expense.controller";

export const expenseRouter = Router();

const allRoles = [
  Role.SUPER_ADMIN,
  Role.SHOP_ADMIN,
  Role.STOREKEEPER,
  Role.JOB_CARD_MANAGER,
];
const adminRoles = [Role.SUPER_ADMIN, Role.SHOP_ADMIN];

expenseRouter.get(
  "/expenses",
  authenticate,
  enforceShopScope,
  authorize(allRoles),
  checkPermission("read"),
  asyncHandler(listExpensesHandler)
);

expenseRouter.post(
  "/expenses",
  authenticate,
  enforceShopScope,
  authorize(allRoles),
  checkPermission("write"),
  asyncHandler(createExpenseHandler)
);

expenseRouter.put(
  "/expenses/:id",
  authenticate,
  enforceShopScope,
  authorize(allRoles),
  checkPermission("write"),
  asyncHandler(updateExpenseHandler)
);

// Delete restricted to admin roles (Storekeeper / Job Card Manager blocked).
expenseRouter.delete(
  "/expenses/:id",
  authenticate,
  enforceShopScope,
  authorize(adminRoles),
  checkPermission("delete"),
  asyncHandler(deleteExpenseHandler)
);
