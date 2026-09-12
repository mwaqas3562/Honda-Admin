import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { hasPermission, Role, type JwtUserContext, type PermissionAction } from "../types/role";

declare global {
  namespace Express {
    interface Request {
      user?: JwtUserContext;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing or invalid authorization header." });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtUserContext;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token." });
  }
}

export function authorize(allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized." });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        message: "Your role is not allowed to access this resource.",
      });
      return;
    }

    next();
  };
}

const ACTION_VERB: Record<PermissionAction, string> = {
  read: "view",
  write: "create or modify",
  delete: "delete",
};

export function checkPermission(action: PermissionAction) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized." });
      return;
    }

    if (!hasPermission(req.user.role, action)) {
      res.status(403).json({
        message: `You are not allowed to ${ACTION_VERB[action]}.`,
        action,
        role: req.user.role,
      });
      return;
    }

    next();
  };
}

export function enforceShopScope(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized." });
    return;
  }

  if (req.user.role === Role.SUPER_ADMIN) {
    next();
    return;
  }

  const requestedShopId = (req.headers["x-shop-id"] as string | undefined) ?? req.user.shopId ?? undefined;
  if (!requestedShopId || requestedShopId !== req.user.shopId) {
    res.status(403).json({ message: "You are not allowed to access another shop's data." });
    return;
  }

  next();
}
