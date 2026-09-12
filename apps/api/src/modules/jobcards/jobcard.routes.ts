import { Router } from "express";
import {
  authenticate, authorize, checkPermission, enforceShopScope,
} from "../../shared/middleware/auth.middleware";
import { Role } from "../../shared/types/role";
import { asyncHandler } from "../../shared/utils/async-handler";
import {
  createJobCardHandler, finalizeJobCardHandler, getJobCardHandler,
  listJobCardsHandler, nextJobNumberHandler, updateJobCardHandler,
} from "./jobcard.controller";
import {
  getJobCardsReportHandler,
  getMechanicJobsHandler,
  getMechanicsReportHandler,
} from "./jobcard-report.controller";

export const jobCardRouter = Router();

const shopRoles = [Role.SUPER_ADMIN, Role.SHOP_ADMIN, Role.STOREKEEPER, Role.JOB_CARD_MANAGER];

// Reports come before /jobcards/:id so the path doesn't shadow the param route
jobCardRouter.get("/jobcards/report",            authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(getJobCardsReportHandler));
jobCardRouter.get("/jobcards/mechanics",         authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(getMechanicsReportHandler));
jobCardRouter.get("/jobcards/mechanics/:name",   authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(getMechanicJobsHandler));
jobCardRouter.get("/jobcards/next-number",       authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"), asyncHandler(nextJobNumberHandler));

// No DELETE route exposed — job cards are immutable history (status=CANCELLED instead).
jobCardRouter.get("/jobcards",     authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"),  asyncHandler(listJobCardsHandler));
jobCardRouter.get("/jobcards/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("read"),  asyncHandler(getJobCardHandler));
jobCardRouter.post("/jobcards",    authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"), asyncHandler(createJobCardHandler));
jobCardRouter.put("/jobcards/:id", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"), asyncHandler(updateJobCardHandler));
jobCardRouter.post("/jobcards/:id/finalize", authenticate, enforceShopScope, authorize(shopRoles), checkPermission("write"), asyncHandler(finalizeJobCardHandler));
