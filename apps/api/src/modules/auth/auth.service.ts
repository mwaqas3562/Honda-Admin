import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { Role } from "../../shared/types/role";

type LoginInput = {
  userId: string;
  role: Role;
  shopId?: string;
};

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  shopId: string | null;
  isActive: boolean;
};

export async function validateUserCredentials(email: string, password: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: {
        select: {
          name: true,
        },
      },
      shopId: true,
      isActive: true,
      passwordHash: true,
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  if (!user.role) {
    return null;
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role.name as Role,
    shopId: user.shopId,
    isActive: user.isActive,
  };
}

export function signAccessToken(input: LoginInput): string {
  const signOptions: jwt.SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  };

  return jwt.sign(
    {
      id: input.userId,
      role: input.role,
      shopId: input.shopId ?? null,
    },
    env.JWT_SECRET,
    signOptions
  );
}
