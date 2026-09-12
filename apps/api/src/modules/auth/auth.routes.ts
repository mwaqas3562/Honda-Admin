import { Router } from "express";
import { authenticate } from "../../shared/middleware/auth.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import { loginHandler, meHandler } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/auth/login", asyncHandler(loginHandler));
authRouter.get("/auth/me", authenticate, meHandler);
