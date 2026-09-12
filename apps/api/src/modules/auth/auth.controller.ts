import type { Request, Response } from "express";
import { z } from "zod";
import { signAccessToken, validateUserCredentials } from "./auth.service";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid login payload.", errors: parsed.error.flatten() });
    return;
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const user = await validateUserCredentials(normalizedEmail, parsed.data.password);
  if (!user) {
    /* P9: audit failed login attempts. Never log the password. */
    const ip = req.ip ?? req.socket.remoteAddress ?? "?";
    console.warn(`[AUDIT] login_failed email=${normalizedEmail} ip=${ip}`);
    res.status(401).json({ message: "Invalid email or password." });
    return;
  }

  console.info(`[AUDIT] login_ok userId=${user.id} role=${user.role} ip=${req.ip ?? "?"}`);
  const token = signAccessToken({
    userId: user.id,
    role: user.role,
    shopId: user.shopId ?? undefined,
  });

  res.json({
    accessToken: token,
    tokenType: "Bearer",
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      shopId: user.shopId ?? null,
    },
  });
}

export function meHandler(req: Request, res: Response): void {
  if (!req.user) {
    res.status(401).json({ message: "Unauthorized." });
    return;
  }

  res.json({ user: req.user });
}
