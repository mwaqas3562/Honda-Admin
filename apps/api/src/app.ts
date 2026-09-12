import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/auth.routes";
import { cashRouter } from "./modules/cash/cash.routes";
import { customerRouter } from "./modules/customers/customer.routes";
import { expenseRouter } from "./modules/expenses/expense.routes";
import { healthRouter } from "./modules/health/health.routes";
import { inventoryRouter } from "./modules/inventory/inventory.routes";
import { invoiceRouter } from "./modules/invoices/invoice.routes";
import { jobCardRouter } from "./modules/jobcards/jobcard.routes";
import { mechanicRouter } from "./modules/mechanics/mechanic.routes";
import { partsRouter } from "./modules/parts/parts.routes";
import { purchaseRouter } from "./modules/purchases/purchase.routes";
import { reportsRouter } from "./modules/reports/reports.routes";
import { serviceRouter } from "./modules/services/service.routes";
import { stockLogRouter } from "./modules/stock-logs/stock-log.routes";
import { vendorRouter } from "./modules/vendors/vendor.routes";
import { errorHandler, notFoundHandler } from "./shared/middleware/error.middleware";

export function createApp() {
  const app = express();

  /* P1: Trust the first proxy hop (Vercel/render/heroku) so rate-limiting
   * sees the real client IP via X-Forwarded-For. Single hop only. */
  app.set("trust proxy", 1);

  app.use(helmet());

  /* P3: CORS — restrict to configured origins in production. */
  const allowed = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  app.use(cors({
    origin: allowed.includes("*") ? true : allowed,
    credentials: true,
  }));

  /* P4: Reduce default body size from 25 MB → 1 MB. The only legitimate
   * large-payload endpoint (inventory bulk upload) overrides this on its route. */
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  /* P1: Rate-limit auth and write endpoints. */
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many login attempts. Try again in 15 minutes." },
  });
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests. Slow down." },
  });
  app.use("/api/v1/auth/login", authLimiter);
  app.use("/api/v1", apiLimiter);

  app.use("/api/v1", healthRouter);
  app.use("/api/v1", authRouter);
  app.use("/api/v1", customerRouter);
  app.use("/api/v1", partsRouter);
  app.use("/api/v1", vendorRouter);
  app.use("/api/v1", purchaseRouter);
  app.use("/api/v1", stockLogRouter);
  app.use("/api/v1", invoiceRouter);
  app.use("/api/v1", jobCardRouter);
  app.use("/api/v1", mechanicRouter);
  app.use("/api/v1", reportsRouter);
  app.use("/api/v1", serviceRouter);
  app.use("/api/v1", cashRouter);
  app.use("/api/v1", expenseRouter);
  app.use("/api/v1", inventoryRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
