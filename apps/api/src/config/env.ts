import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  /** Min 32 chars; in production, refuse to start with the dev placeholder. */
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("1d"),
  /** Comma-separated list of allowed origins; "*" allows all (dev only). */
  CORS_ORIGINS: z.string().default("*"),
  BCRYPT_COST: z.coerce.number().min(10).max(14).default(12),
});

const parsed = envSchema.parse(process.env);

if (parsed.NODE_ENV === "production") {
  if (/change_?me|local_dev|placeholder/i.test(parsed.JWT_SECRET)) {
    throw new Error("Refusing to start: JWT_SECRET looks like a development placeholder.");
  }
  if (parsed.CORS_ORIGINS === "*") {
    throw new Error("Refusing to start: CORS_ORIGINS must be set in production (no wildcard).");
  }
}

export const env = parsed;
