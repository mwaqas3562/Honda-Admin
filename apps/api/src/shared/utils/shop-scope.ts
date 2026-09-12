import type { Request } from "express";
import { BusinessError } from "../errors/business-error";
import { Role } from "../types/role";

/**
 * Resolve the shop the current request operates on.
 *
 * - Regular users: must use their JWT-bound shopId. The `x-shop-id` header,
 *   if present, must match it (already enforced by enforceShopScope, but we
 *   double-check here to keep the helper safe in isolation).
 * - SUPER_ADMIN: must explicitly target a shop via the `x-shop-id` header.
 *   Without it we throw, instead of silently issuing queries with `undefined`
 *   that would leak data across shops.
 */
export function getShopScope(req: Request): string {
  const user = req.user;
  if (!user) {
    throw new BusinessError("Unauthorized.", 401);
  }

  const headerShopId = (req.headers["x-shop-id"] as string | undefined) ?? undefined;

  if (user.role === Role.SUPER_ADMIN) {
    const targetShop = headerShopId ?? user.shopId ?? null;
    if (!targetShop) {
      throw new BusinessError(
        "SUPER_ADMIN must target a specific shop via the x-shop-id header.",
        400
      );
    }
    return targetShop;
  }

  if (!user.shopId) {
    throw new BusinessError("Your account is not assigned to any shop.", 403);
  }
  if (headerShopId && headerShopId !== user.shopId) {
    throw new BusinessError("You are not allowed to access another shop's data.", 403);
  }
  return user.shopId;
}
