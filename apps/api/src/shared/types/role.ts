export enum Role {
  SUPER_ADMIN = "SUPER_ADMIN",
  SHOP_ADMIN = "SHOP_ADMIN",
  STOREKEEPER = "STOREKEEPER",
  JOB_CARD_MANAGER = "JOB_CARD_MANAGER",
}

export type PermissionAction = "read" | "write" | "delete";

const rolePermissions: Record<Role, PermissionAction[]> = {
  [Role.SUPER_ADMIN]: ["read", "write", "delete"],
  [Role.SHOP_ADMIN]: ["read", "write", "delete"],
  [Role.STOREKEEPER]: ["read", "write"],
  [Role.JOB_CARD_MANAGER]: ["read", "write"],
};

export function hasPermission(role: Role, action: PermissionAction): boolean {
  return rolePermissions[role].includes(action);
}

export type JwtUserContext = {
  id: string;
  role: Role;
  shopId?: string | null;
};
