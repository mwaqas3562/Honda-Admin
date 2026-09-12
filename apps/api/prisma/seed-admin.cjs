/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Production seed: creates one shop, the four roles, and a single SUPER_ADMIN
 * account from environment variables. Unlike seed.cjs it never writes a known
 * password, so it is safe to run against an internet-facing database.
 *
 * Run:  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' npm --workspace apps/api run seed:admin
 *
 * Optional: ADMIN_NAME, SHOP_NAME, SHOP_CODE.
 * Re-running updates the admin's password and role rather than duplicating it.
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
require("dotenv").config();

/* Migrations and seeding go through the unpooled connection. */
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("✗ Set DIRECT_URL (or DATABASE_URL) before seeding.");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

const ROLE_NAMES = ["SUPER_ADMIN", "SHOP_ADMIN", "STOREKEEPER", "JOB_CARD_MANAGER"];

function readConfig() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const problems = [];

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    problems.push("ADMIN_EMAIL must be a valid email address.");
  }
  if (password.length < 12) {
    problems.push("ADMIN_PASSWORD must be at least 12 characters.");
  }
  if (/^password|123456|admin$/i.test(password)) {
    problems.push("ADMIN_PASSWORD is too predictable.");
  }
  if (problems.length) {
    console.error("✗ Cannot seed:");
    for (const p of problems) console.error("   - " + p);
    process.exit(1);
  }

  return {
    email,
    password,
    fullName: process.env.ADMIN_NAME || "Administrator",
    shopName: process.env.SHOP_NAME || "Honda Workshop — Main Branch",
    shopCode: process.env.SHOP_CODE || "HONDA-MAIN",
  };
}

async function main() {
  const cfg = readConfig();
  const cost = Number(process.env.BCRYPT_COST || 12);

  const shop = await prisma.shop.upsert({
    where: { code: cfg.shopCode },
    update: {},
    create: { code: cfg.shopCode, name: cfg.shopName },
  });

  const roles = {};
  for (const name of ROLE_NAMES) {
    roles[name] = await prisma.role.upsert({
      where: { shopId_name: { shopId: shop.id, name } },
      update: {},
      create: { shopId: shop.id, name, description: `${name} role` },
    });
  }

  const passwordHash = await bcrypt.hash(cfg.password, cost);
  const admin = await prisma.user.upsert({
    where: { email: cfg.email },
    update: {
      passwordHash,
      roleId: roles.SUPER_ADMIN.id,
      shopId: shop.id,
      fullName: cfg.fullName,
      isActive: true,
      isDeleted: false,
    },
    create: {
      email: cfg.email,
      fullName: cfg.fullName,
      passwordHash,
      shopId: shop.id,
      roleId: roles.SUPER_ADMIN.id,
    },
  });

  /* Guard against a demo seed having been run against this database earlier. */
  const demo = await prisma.user.findMany({
    where: { email: { endsWith: "@honda.local" }, isDeleted: false },
    select: { email: true },
  });

  console.log("");
  console.log("✓ Seed complete.");
  console.log(`    Shop:  ${shop.name} (${shop.code})`);
  console.log(`    Roles: ${ROLE_NAMES.join(", ")}`);
  console.log(`    Admin: ${admin.email}  [SUPER_ADMIN]`);
  if (demo.length) {
    console.log("");
    console.log(`⚠ ${demo.length} demo account(s) from seed.cjs still exist on this database:`);
    for (const u of demo) console.log(`    ${u.email}`);
    console.log("  Deactivate or delete them before exposing this deployment.");
  }
  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
